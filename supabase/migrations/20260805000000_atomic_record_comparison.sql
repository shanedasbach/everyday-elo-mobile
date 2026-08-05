-- Atomic write for a single comparison outcome.
--
-- Replaces the four independent client-side writes previously issued by
-- persistComparison() (two ranked_items updates, the comparisons_count
-- increment, and the comparisons insert). Those ran via Promise.allSettled
-- with no transaction, so a mid-flight connection drop (backgrounding,
-- tunnel handoff, dead zone) could land any subset of the four and leave
-- ranked_items ratings permanently desynced from the comparisons audit log
-- (see everyday-elo-mobile#69).
--
-- Ranked-item update parameters are nullable so the same function also
-- serves a skipped comparison (no winner, no rating change) — see
-- lib/api.ts's persistSkippedComparison.
--
-- p_idempotency_key makes the call safe to repeat: the connection drop this
-- function exists to survive can also swallow the *response* to a call that
-- the server already committed, so the client's only safe move on a failure
-- is "retry the identical call." client_token + the partial unique index
-- below turn a retry of an already-applied write into a no-op instead of a
-- second insert/increment.
alter table public.comparisons add column client_token text;

create unique index comparisons_client_token_idx
  on public.comparisons (client_token)
  where client_token is not null;

create or replace function public.record_comparison(
  p_ranking_id uuid,
  p_item_a_id uuid,
  p_item_b_id uuid,
  p_winner_item_id uuid,
  p_winner_ranked_item_id uuid,
  p_winner_rating integer,
  p_winner_comparisons integer,
  p_loser_ranked_item_id uuid,
  p_loser_rating integer,
  p_loser_comparisons integer,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_inserted integer;
begin
  -- Gate on the insert first: if this exact write already landed (same
  -- client_token), skip the rating updates and the counter increment too,
  -- so a repeated call is a total no-op rather than a partial one.
  insert into public.comparisons (ranking_id, item_a_id, item_b_id, winner_id, client_token)
  values (p_ranking_id, p_item_a_id, p_item_b_id, p_winner_item_id, p_idempotency_key)
  on conflict (client_token) where client_token is not null do nothing;

  get diagnostics v_rows_inserted = row_count;

  if v_rows_inserted = 0 then
    return;
  end if;

  if p_winner_ranked_item_id is not null then
    update public.ranked_items
    set rating = p_winner_rating,
        comparisons = p_winner_comparisons
    where id = p_winner_ranked_item_id;
  end if;

  if p_loser_ranked_item_id is not null then
    update public.ranked_items
    set rating = p_loser_rating,
        comparisons = p_loser_comparisons
    where id = p_loser_ranked_item_id;
  end if;

  update public.rankings
  set comparisons_count = comparisons_count + 1,
      updated_at = now()
  where id = p_ranking_id;
end;
$$;

grant execute on function public.record_comparison(
  uuid, uuid, uuid, uuid, uuid, integer, integer, uuid, integer, integer, text
) to anon, authenticated;

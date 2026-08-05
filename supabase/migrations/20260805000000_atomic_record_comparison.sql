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
  p_loser_comparisons integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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

  insert into public.comparisons (ranking_id, item_a_id, item_b_id, winner_id)
  values (p_ranking_id, p_item_a_id, p_item_b_id, p_winner_item_id);
end;
$$;

grant execute on function public.record_comparison(
  uuid, uuid, uuid, uuid, uuid, integer, integer, uuid, integer, integer
) to anon, authenticated;

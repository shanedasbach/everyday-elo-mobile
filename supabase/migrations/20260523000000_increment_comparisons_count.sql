-- Atomic increment for rankings.comparisons_count.
--
-- Replaces the previous client-side read-modify-write pattern in
-- incrementComparisonsCount() with a single round-trip that increments
-- the counter server-side. This removes the lost-update race that
-- could occur when the same ranking was being updated concurrently
-- (e.g. two devices, or back-to-back taps before the prior write
-- returned).
create or replace function public.increment_comparisons_count(p_ranking_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rankings
  set comparisons_count = comparisons_count + 1,
      updated_at = now()
  where id = p_ranking_id;
$$;

grant execute on function public.increment_comparisons_count(uuid) to anon, authenticated;

-- Drop the now-orphaned increment_comparisons_count function.
--
-- record_comparison (see 20260805000000_atomic_record_comparison.sql) already
-- increments rankings.comparisons_count as part of its atomic write, and was
-- the only production caller of the old counter logic. incrementComparisonsCount
-- in lib/api.ts had no remaining call sites and has been removed.
drop function if exists public.increment_comparisons_count(uuid);

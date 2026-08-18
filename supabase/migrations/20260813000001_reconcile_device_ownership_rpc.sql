-- Move reconcileDeviceOwnership's delete server-side.
--
-- The previous client-side version ran as:
--   supabase.from('push_tokens').delete().eq('device_id', d).neq('user_id', u)
-- authenticated as the signed-in user via the anon-key client. push_tokens
-- isn't created by a migration in this repo (provisioned outside
-- supabase/migrations/, consistent with known drift between the web and
-- mobile checkouts of this shared Supabase project), but every RLS mutation
-- policy actually checked in here follows `using (auth.uid() = <owner_id>)`
-- (see 20260308000000_social_features.sql). If push_tokens has an equivalent
-- delete policy, `auth.uid() = user_id` and the query's `user_id <> auth.uid()`
-- are mutually exclusive — RLS would silently filter the delete to zero rows
-- on every call, so the #96 self-heal this function exists for would never
-- actually fire in production.
--
-- A security definer function bypasses that: it isn't subject to the caller's
-- own RLS, so it can delete a *different* user's row for this device_id.
-- Deliberately ignores any client-supplied user id and reads auth.uid() from
-- the request JWT instead — a security definer function must not trust a
-- caller-supplied identity for what it's allowed to act as.
create or replace function public.reconcile_device_ownership(p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
  where device_id = p_device_id
    and user_id <> auth.uid();
end;
$$;

grant execute on function public.reconcile_device_ownership(text) to authenticated;

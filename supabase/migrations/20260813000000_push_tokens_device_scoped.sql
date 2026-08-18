-- push_tokens: add a device-scoped identity separate from the Expo push
-- token itself.
--
-- The existing upsert (onConflict: 'token') assumes the push token is a
-- stable device identity, but it's only stable per app installation, not per
-- physical device+account pairing. On a shared/borrowed device, if sign-out's
-- best-effort token removal fails (offline, silently swallowed error) and a
-- different account signs in, the old user's row can be left pointing at
-- this device with no signal that it's stale (everyday-elo-mobile#96).
--
-- device_id is a random per-install identifier generated client-side and
-- persisted in SecureStore (see lib/notifications.ts's getOrCreateDeviceId).
-- Keying the upsert/delete on (user_id, device_id) instead of token lets the
-- client reconcile ownership of a device at sign-in time — independent of
-- whatever the token value happens to be — by deleting any row for this
-- device_id owned by a different user before claiming it for the signed-in
-- user (see reconcileDeviceOwnership).
--
-- device_id starts out null for existing rows; Postgres treats multiple
-- nulls in a unique constraint as distinct, so this doesn't collide with
-- pre-existing data. Those pre-migration rows are also never reconciled
-- (reconcile_device_ownership matches on device_id, which is never null on
-- the querying side) — harmless, since the next sign-in on that install
-- generates and persists a device_id, after which it reconciles normally.
alter table push_tokens add column if not exists device_id text;

alter table push_tokens
  add constraint push_tokens_user_device_key unique (user_id, device_id);

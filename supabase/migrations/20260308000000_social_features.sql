-- Social Features: follows, activity feed
-- Mirrors everyday-elo (web) migration of the same name for parity with the
-- shared Supabase backend. This file exists for documentation and local
-- environments; the tables themselves are already managed by the web app's
-- migration history on the shared project.
-- ============================================
-- FOLLOWS
-- ============================================
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  constraint follows_unique unique (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id != following_id)
);

create index if not exists idx_follows_follower_id on public.follows(follower_id);
create index if not exists idx_follows_following_id on public.follows(following_id);

alter table public.follows enable row level security;

drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy "Follows are viewable by everyone"
  on public.follows for select
  using (true);

drop policy if exists "Users can follow others" on public.follows;
create policy "Users can follow others"
  on public.follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow others" on public.follows;
create policy "Users can unfollow others"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- ============================================
-- ACTIVITY
-- ============================================
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null,
  list_id uuid default null,
  target_user_id uuid references public.profiles(id) on delete set null default null,
  metadata jsonb default '{}',
  created_at timestamp with time zone default now() not null
);

create index if not exists idx_activity_user_created on public.activity(user_id, created_at desc);

alter table public.activity enable row level security;

drop policy if exists "Users can view own activity" on public.activity;
create policy "Users can view own activity"
  on public.activity for select
  using (auth.uid() = user_id);

drop policy if exists "Users can view followed users activity" on public.activity;
create policy "Users can view followed users activity"
  on public.activity for select
  using (
    exists (
      select 1 from public.follows
      where follows.follower_id = auth.uid()
        and follows.following_id = activity.user_id
    )
  );

drop policy if exists "Users can insert own activity" on public.activity;
create policy "Users can insert own activity"
  on public.activity for insert
  with check (auth.uid() = user_id);

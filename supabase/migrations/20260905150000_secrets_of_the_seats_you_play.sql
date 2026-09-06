-- ── The host holds the hands of the seats it plays ───────────────────────────
--
-- A computer seat has no account, so no session could ever satisfy "read your
-- own secrets" for it — and yet somebody's machine plays that seat: the match
-- creator's, the one apply-action already accepts the computer's actions from.
-- So the host drove a computer's draft holding a hand it could not see, and
-- the board came down on the first read of it (2026-09-05, turn one of a new
-- campaign; the joiners' screens were fine).
--
-- The read rule becomes the same rule as the write rule: a session may read the
-- rows of the seats it PLAYS — its own, and every computer seat of a match it
-- created. Nothing else moves. A joiner still sees exactly one row, and no
-- client can write any: the write policies stay absent, and are asserted so.
drop policy if exists "read your own secrets" on match_secrets;
drop policy if exists "read the seats you play" on match_secrets;
create policy "read the seats you play"
  on match_secrets for select
  using (exists (
    select 1 from match_players mp
    where mp.match_id = match_secrets.match_id
      and mp.player_id = match_secrets.player_id
      and (
        mp.user_id = auth.uid()
        or (mp.is_ai and exists (
          select 1 from matches m
          where m.id = match_secrets.match_id
            and m.created_by = auth.uid()))
      )
  ));

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'match_secrets' and policyname = 'read the seats you play') then
    raise exception 'match_secrets read policy missing';
  end if;
  if exists (select 1 from pg_policies
             where tablename = 'match_secrets' and policyname = 'read your own secrets') then
    raise exception 'the old read-your-own policy is still there beside the new one';
  end if;
  if exists (select 1 from pg_policies
             where tablename = 'match_secrets' and cmd in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'match_secrets has a client write policy — only the service role may write';
  end if;
end $$;

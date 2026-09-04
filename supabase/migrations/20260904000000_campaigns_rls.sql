-- Scope campaigns to their roster.
--
-- The five placeholder policies this replaces predate accounts: anon read,
-- public read, public write, anon insert, anon update. Together they mean
-- anyone holding the anon key — which ships in the client bundle — can read and
-- rewrite every campaign in the database. The blob they reach includes the
-- roster, the whole campaign record, and (today) every player's card hand.
--
-- DO NOT APPLY BLIND. This changes who can read existing rows; see the
-- breakage notes at the foot of this file.
--
-- ARMED 2026-09-04, renumbered from 20260816160000. It was held while the join
-- path still claimed its seat by writing through the table, which these
-- policies refuse; joinCampaign now goes through join_campaign_by_code's claim
-- half. The number moved because `db push` applies in timestamp order and would
-- otherwise treat a file older than the last applied migration as history.

-- ── The rule ─────────────────────────────────────────────────────────────────
-- The roster lives inside legacy_state as an array of members, each with an
-- optional `userId` — accounts are optional by design and an unclaimed member
-- plays exactly as before. There is no campaign_members table to join against,
-- so membership is read out of the blob.
--
-- A campaign is CLAIMED once any member has claimed a seat with an account.
--
--   unclaimed -> reachable by anyone who knows the UUID
--   claimed   -> reachable only by the accounts on its roster
--
-- Unclaimed campaigns keep the current posture deliberately, because that is
-- what keeps guests working: a campaign played entirely without accounts has no
-- auth.uid() to match, and scoping it to accounts would lock its own players
-- out of it. The protection there is the unguessability of a v4 UUID, which is
-- also all that protects a join code today. It is strictly tighter than the
-- status quo, and it is not the same thing as private.
--
-- The moment ONE person claims a seat, the campaign locks to its roster.

create or replace function campaign_is_claimed(ls jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(ls -> 'roster', '[]'::jsonb)) as m
    where nullif(m ->> 'userId', '') is not null
  );
$$;

create or replace function campaign_has_member(ls jsonb, uid uuid)
returns boolean
language sql
immutable
as $$
  select uid is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(ls -> 'roster', '[]'::jsonb)) as m
    where nullif(m ->> 'userId', '') = uid::text
  );
$$;

-- ── Out with the placeholders ────────────────────────────────────────────────
-- Named individually rather than dropped in a loop: if one has been renamed
-- since, the verify block at the foot catches the survivor rather than this
-- silently doing nothing.
alter table campaigns enable row level security;

drop policy if exists "anon read campaigns"    on campaigns;
drop policy if exists "public read campaigns"  on campaigns;
drop policy if exists "public write campaigns" on campaigns;
drop policy if exists "anon insert campaigns"  on campaigns;
drop policy if exists "anon update campaigns"  on campaigns;

-- ── In with the scoped set ───────────────────────────────────────────────────

drop policy if exists "read own campaigns" on campaigns;
create policy "read own campaigns"
  on campaigns for select
  using (
    not campaign_is_claimed(legacy_state)
    or campaign_has_member(legacy_state, auth.uid())
  );

-- Creation. A campaign is born with no roster, so it is unclaimed and this
-- allows it. It does NOT allow inserting a row already claimed by somebody
-- else, which would otherwise let a caller manufacture a campaign attributed to
-- another account.
drop policy if exists "create campaigns" on campaigns;
create policy "create campaigns"
  on campaigns for insert
  with check (
    not campaign_is_claimed(legacy_state)
    or campaign_has_member(legacy_state, auth.uid())
  );

-- Writes are the same test on both sides: you must be able to reach the row as
-- it stands, and you must still be on it afterwards. The `with check` half is
-- what stops a member rewriting the roster to evict everyone including
-- themselves, or handing the campaign to an account that is not theirs.
drop policy if exists "write own campaigns" on campaigns;
create policy "write own campaigns"
  on campaigns for update
  using (
    not campaign_is_claimed(legacy_state)
    or campaign_has_member(legacy_state, auth.uid())
  )
  with check (
    not campaign_is_claimed(legacy_state)
    or campaign_has_member(legacy_state, auth.uid())
  );

-- No delete policy: a legacy campaign is the one thing in this game that must
-- not be destroyable by a client. Its absence refuses every delete.
--
-- THE ORIGINAL NOTE HERE SAID "nothing in the app deletes a campaign". THAT IS
-- WRONG, and it is the sharpest edge on this migration. CampaignPicker has a ✕
-- on every row which calls deleteCampaign, and an RLS-refused DELETE is not an
-- error — it matches no rows and returns success. So the button will appear to
-- work, the list will refresh, and the campaign will still be there.
--
-- Left refusing anyway, because the alternative is a policy that lets any
-- member destroy a shared campaign for everyone. Two ways to close it, both a
-- decision rather than a fix, and neither taken here:
--
--   Own it — a delete policy scoped to members, accepting that one player can
--   end a campaign five others are in.
--   Retire it — drop the ✕ from the picker, or make it hide the campaign
--   locally rather than delete the row.
--
-- Until one is chosen, deleteCampaign should at least tell the truth: it checks
-- only `error`, so add a count check and raise when nothing was removed.

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  leftover text;
  missing  text;
begin
  if not exists (select 1 from pg_tables
                 where tablename = 'campaigns' and rowsecurity = true) then
    raise exception 'campaigns has RLS disabled — every policy below is decorative';
  end if;

  -- The point of the migration: the permissive five must be gone.
  select string_agg(policyname, ', ') into leftover
    from pg_policies
   where tablename = 'campaigns'
     and policyname not in ('read own campaigns', 'create campaigns', 'write own campaigns');
  if leftover is not null then
    raise exception 'unexpected campaigns policies still present: %', leftover;
  end if;

  select string_agg(c.expected, ', ') into missing
    from (values ('read own campaigns'), ('create campaigns'), ('write own campaigns')) as c(expected)
   where not exists (select 1 from pg_policies p
                     where p.tablename = 'campaigns' and p.policyname = c.expected);
  if missing is not null then
    raise exception 'campaigns policies missing: %', missing;
  end if;

  if exists (select 1 from pg_policies where tablename = 'campaigns' and cmd = 'DELETE') then
    raise exception 'campaigns has a delete policy — a client could destroy a legacy campaign';
  end if;
end $$;

-- ── What this breaks, and what has to land with it ───────────────────────────
--
-- 1. JOIN BY CODE — HANDLED, 2026-09-04. Both halves now go through
--    join_campaign_by_code: the lookup (findCampaignByJoinCode) already did,
--    and joinCampaign's claim does now instead of writing through the table.
--    The roster RULES stay in TypeScript — claimRosterSeat judges, the rpc
--    reaches — so there is no second copy of them in plpgsql to disagree.
--
--    A guest taking an unclaimed seat now writes NOTHING. It used to save the
--    blob back unchanged, which is a write a non-member is rightly refused and
--    which never had anything to save.
--
-- 1b. ADDING A NEW NAME BY CODE still writes through the table, so it works
--    while the campaign is unclaimed and is refused once anyone has linked an
--    account. On a claimed campaign a member must add the name first (the
--    campaign screen does that) and the newcomer then claims it. Deliberate:
--    routing it through the rpc would mean reimplementing the roster rules —
--    name length, duplicates, the cap, the joining game number — in plpgsql.
--
-- 2. A player who never claimed a seat loses access once anyone else claims
--    one. Mixed campaigns — some accounts, some not — are the common case in
--    this project, and they become readable only by the account holders. The
--    unclaimed players are not locked out of PLAY (the match row is scoped by
--    match_players, untouched here) but they cannot read the campaign blob,
--    which is where scars, stickers and history live.
--
-- 3. Anything reading a campaign outside a member session breaks. Audited
--    2026-09-04: apply-action reads campaigns with the SERVICE ROLE, and so do
--    scripts/check-seat-privacy.mjs, scripts/seed-dune-match.mjs and the e2e
--    harness's ageCampaign. All four bypass RLS and are unaffected.
--
-- 4. THE ✕ ON THE CAMPAIGN PICKER goes quiet — see the delete note above. It is
--    the only breakage here that fails SILENTLY rather than loudly.
--
-- 5. THE PICKER LISTS LESS, which is the migration working. listCampaigns
--    selects with no filter and has always returned every campaign in the
--    database to everybody; afterwards it returns the unclaimed ones plus your
--    own. Anyone who has been using it as a list of all campaigns will find
--    theirs gone from other accounts' screens — correct, and worth saying out
--    loud before somebody reports it as data loss.
--
-- 6. THE DEGRADED JOIN PATH cannot find claimed campaigns. When the join_code
--    column is missing, findCampaignByJoinCode falls back to scanning every row
--    for a code kept inside the blob — and it can only scan what it may read.
--    That fallback only runs on a database without the column, which this
--    project's has, so it is a footnote rather than a breakage.
--
-- Nothing here is reversible by a second migration alone: once the permissive
-- policies are gone, a client that relied on them fails immediately. Apply it
-- with the join rpc, not before.

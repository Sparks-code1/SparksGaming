-- Release a battle whose defender's screen never received it.
--
-- One-off. Test attacked Ryan; the attacker's dice reached the server and the
-- defence never came, because the defender's window was not receiving match
-- updates — so the defender sat in a battle screen with no dice and no exit
-- (a defender is deliberately given no way out of a defence), and the
-- attacker's machine had no reason to close a battle it was still driving.
--
-- Clearing the session is what RETREAT does, and it is safe for exactly the
-- same reason: no troops have moved. Only RESOLVE_COMBAT moves them, and it
-- has not run — there are no defence dice to resolve against. The attack can
-- simply be declared again.
--
-- The version bump is what makes both machines take the corrected board.
update matches
   set state = jsonb_set(state, '{combat}', 'null'::jsonb),
       version = version + 1,
       updated_at = now()
 where status = 'active'
   and jsonb_typeof(state->'combat') = 'object'
   and state->'combat'->>'defDice' is null
   and (updated_at < now() - interval '2 minutes');

-- Example: create a one-use invite code.
-- Change the raw code to a long, random, unique value before running.
-- Keep the raw code private and send it only to the invited person.
-- The database stores only the SHA-256 hash.
insert into public.studyhub_invites (code_hash, max_uses, expires_at, active)
values (
  encode(extensions.digest(convert_to('REPLACE-WITH-LONG-RANDOM-INVITE-CODE', 'UTF8'), 'sha256'), 'hex'),
  1,
  now() + interval '7 days',
  true
);
-- After running, send the exact raw code used above to the intended invitee.

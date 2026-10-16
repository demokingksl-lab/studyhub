# StudyHub Invite Platform

Responsive bilingual (Myanmar/English) learning platform starter with Supabase Auth + Postgres schema and invite-only registration UI.

## What is included
- Responsive front end (Vite)
- Myanmar/English language toggle
- Supabase email/password sign-in and sign-up wiring
- Invitation-code verification and one-use redemption SQL functions
- Profile table, published lesson table, and Row Level Security policies
- `.env.example`, schema SQL, invite seed example, deployment/security checklist

## Honest status
This is a deployable starter, NOT a completed live service. No Supabase project, domain, hosting account, real invite code, or production URL has been created by this package. You must configure the external services and test them before inviting real users. The initial signup flow is a starter implementation; the SQL file explains how to harden it using an Edge Function so signup and invite consumption happen server-side in one controlled workflow. Do not call it production-secure until that hardening and testing are complete.

## Local preview
Requirements: Node.js 20.19+ or 22.12+.
1. Extract this ZIP.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Create a Supabase project and fill in its Project URL and public anon/publishable key in `.env.local`.
5. In Supabase SQL Editor, run `supabase/schema.sql`.
6. Run `npm run dev` and open the local URL printed by Vite.

Do not place the Supabase `service_role` key or database password in `.env.local` as a `VITE_*` variable. Anything prefixed `VITE_` is exposed to browser code.

## Supabase setup
1. Create a new project in Supabase.
2. Open Project Settings / API and copy the Project URL and public anon/publishable key.
3. Authentication settings: enable email/password, require email confirmation for production, set Site URL and allowed redirect URLs for local development and your final deployed domain.
4. Run `supabase/schema.sql` in SQL Editor.
5. Create a long random invitation code. Replace the placeholder in `supabase/seed-example.sql` and run it. Send the exact raw code privately to one invitee. Do not commit real invite codes.
6. Before public launch, implement a Supabase Edge Function that validates invite, creates the account and consumes the invite server-side; use service role only in Edge Function secrets, never in frontend. Add abuse protection/rate limits and test race conditions.

## Deploy to a static host (e.g. Vercel or Netlify)
1. Push the project to a private Git repository.
2. Import the repository into your hosting provider.
3. Build command: `npm run build`; output directory: `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as hosting environment variables.
5. Add the deployed URL to Supabase Auth redirect allowlist and set the production Site URL.
6. Enable HTTPS; verify email confirmation, sign-in, sign-out, invalid invite, reused invite, mobile layouts and RLS behavior.
7. Connect a custom domain if desired. A domain plus HTTPS is normally easier than giving users a fixed IP.

## Production security checklist
- Harden invite signup with a server-side Edge Function and atomic invite consumption.
- Keep service-role keys, SMTP credentials and database credentials server-side only.
- Enable email confirmation and secure password reset; consider MFA for admins.
- Configure rate limits, bot protection, monitoring, backups and recovery testing.
- Test RLS as anonymous and as another authenticated user; ensure no user can read another user's profile.
- Add a secure admin-only invite creation/revocation workflow; do not grant invite table access to normal users.
- Add community rules, privacy notice, reporting/blocking and moderation before enabling user-generated content.
- Update dependencies and review security advisories.
- No website can be guaranteed impossible to hack.

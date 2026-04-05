# Synq on Vercel for Students

This is the cheapest path that matches the codebase today:

- Vercel free tier for the app
- Google OAuth through Auth.js
- Neon free Postgres for shared chat state
- Invite-only access via a simple email allowlist

## Architecture

- Deploy only `apps/web`
- Do not deploy `apps/api` for this setup
- Chat sync uses lightweight polling, which works reliably on Vercel free

## 1. Push the repo

Push this repo to GitHub first.

## 2. Create the Vercel project

1. Import the GitHub repo into Vercel
2. Set the **Root Directory** to `apps/web`
3. Leave the framework as Next.js

## 3. Create the free database

1. In Vercel, add the Neon integration or create a free Neon project manually
2. Copy the connection string into `POSTGRES_URL`

Synq auto-creates the small tables it needs on first request, so you do not need to run a separate migration for this Vercel path.

## 4. Create the Google OAuth app

In Google Cloud Console:

1. Create an OAuth client of type **Web application**
2. Add this authorized redirect URI:
   - `https://YOUR-VERCEL-DOMAIN/api/auth/callback/google`
3. If you add a custom domain later, also add:
   - `https://YOUR-CUSTOM-DOMAIN/api/auth/callback/google`

Then copy:

- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

## 5. Add Vercel environment variables

Use `.env.vercel.example` as the source of truth.

Required:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `POSTGRES_URL`
- `SYNQ_INVITE_EMAILS`

`SYNQ_INVITE_EMAILS` is a comma-separated allowlist of Google emails that are allowed into the app.

## 6. Deploy

Deploy from Vercel normally. After deploy:

1. Open `/chat`
2. Sign in with one of the invited Google accounts
3. Finish onboarding
4. Ask your friends on the invite list to do the same

## 7. If something breaks

Check these first:

- Google redirect URI exactly matches the deployed domain
- `POSTGRES_URL` is set in Vercel
- invited emails are listed exactly in `SYNQ_INVITE_EMAILS`
- the Vercel project root directory is `apps/web`

## Notes

- This setup is for a friends-only demo, not a high-scale public launch
- The old Fastify API path is no longer required for the Vercel deployment path
- The app now prefers Google auth over the earlier custom passkey demo flow

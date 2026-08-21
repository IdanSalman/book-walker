# Book Walker

Multi-user reading tracker for manga/manhwa/manhua, light novels, and books. Track page progress, rate titles, and manage a shared catalog as an admin.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS (dark UI)
- Auth.js (Google + GitHub OAuth)
- PostgreSQL + Prisma

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection string (pooled URL on Vercel if available) |
   | `DIRECT_URL` | Direct (non-pooled) URL for migrations; same as `DATABASE_URL` without a pooler |
   | `AUTH_SECRET` | Random secret (`openssl rand -base64 32`) |
   | `AUTH_URL` | Public site URL (`http://localhost:3000` locally) |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth credentials |
   | `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth credentials |
   | `ADMIN_EMAILS` | Comma-separated emails that receive admin role |

3. **OAuth apps**

   - Google: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - GitHub: [Developer settings](https://github.com/settings/developers) — callback URL: `http://localhost:3000/api/auth/callback/github`

4. **Database**

   ```bash
   npx prisma migrate dev --name init
   ```

5. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Create a hosted PostgreSQL database (Neon, Supabase, or similar) and run the same schema this repo ships in `prisma/migrations`.
2. Import the GitHub repo in [Vercel](https://vercel.com/new). The `vercel-build` script generates Prisma Client, applies migrations, then runs `next build`.
3. Set these environment variables for **Production** (and Preview if you use OAuth there):

   - `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`
   - OAuth IDs/secrets and `ADMIN_EMAILS`

4. Add OAuth callback URLs for the Vercel domain:

   - `https://<your-app>.vercel.app/api/auth/callback/google`
   - `https://<your-app>.vercel.app/api/auth/callback/github`

   Set `AUTH_URL` to that same `https://<your-app>.vercel.app` origin (or your custom domain).

Local PDF uploads persist on disk in development. On Vercel the filesystem is ephemeral and request bodies are capped near 4.5 MB, so large in-app PDF files are not a production storage solution. Remote catalog reading does not depend on that.

## Roles

- **User** — personal library, progress, ratings
- **Admin** — full catalog CRUD; admin nav only appears after signing in with an email listed in `ADMIN_EMAILS`

## Categories

- Manga / Manhwa / Manhua
- Light Novels
- Books

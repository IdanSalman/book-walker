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
   | `DATABASE_URL` | PostgreSQL connection string |
   | `AUTH_SECRET` | Random secret (`openssl rand -base64 32`) |
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

## Roles

- **User** — personal library, progress, ratings
- **Admin** — full catalog CRUD; admin nav only appears after signing in with an email listed in `ADMIN_EMAILS`

## Categories

- Manga / Manhwa / Manhua
- Light Novels
- Books

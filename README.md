# Backend

The Express API, database package, generated Zod schemas, API specification, utility scripts, and backend deployment config live here. This folder is deployable by itself on Vercel.

Run from this folder:

```bash
pnpm run dev
pnpm run typecheck
pnpm run build
pnpm run start
```

Database commands are available as `pnpm run db:push` and `pnpm run db:push-force`.

For separate frontend hosting, set `FRONTEND_ORIGIN`/`CORS_ORIGINS` to the Hostinger domain and set `CROSS_SITE_COOKIES=true` so admin and client portal sessions work across domains.

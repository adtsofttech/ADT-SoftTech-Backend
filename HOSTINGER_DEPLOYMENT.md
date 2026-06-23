# Separate Deployment Notes

The project is now split for separate deployments:

- `backend/` deploys the Express API to Vercel.
- `frontend/` deploys the React/Vite site to Hostinger.

## Backend on Vercel

Use `backend` as the Vercel project root.

Install:

```bash
pnpm install --frozen-lockfile
```

Build:

```bash
pnpm run build
```

Vercel serves the API through `api/[...path].ts`, so `https://your-backend.vercel.app/api/healthz` should respond.

Set these Vercel environment variables:

```bash
FRONTEND_ORIGIN=https://your-hostinger-domain.com
CORS_ORIGINS=https://your-hostinger-domain.com
CROSS_SITE_COOKIES=true
ADMIN_USER=your-admin-user
ADMIN_PASSWORD=your-strong-admin-password
ADMIN_SESSION_SECRET=your-long-random-secret
CLIENT_PORTAL_SESSION_SECRET=your-long-random-secret
PUBLIC_SITE_URL=https://your-hostinger-domain.com
```

For persistent production data, set `DATABASE_URL`. To mirror form/client portal records into Firebase Firestore, set the Firebase service account env vars from `.env.example`.

## Frontend on Hostinger

Use `frontend` as the Hostinger project root.

Install:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Build:

```bash
VITE_API_BASE_URL=https://your-backend.vercel.app pnpm run build
```

Publish `frontend/app/dist/public`. The build includes `.htaccess` for SPA routing.

## Required Environment Variables

Set these in Hostinger/build environment:

```bash
VITE_API_BASE_URL=https://your-backend.vercel.app
```

Optional Firebase Analytics config:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

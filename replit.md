# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)

## Structure

```text
workspace/
|-- backend/                       # pnpm workspace root + API/deploy config
|   |-- api-server/                 # Express API server
|   |-- packages/
|   |   |-- api-spec/               # OpenAPI spec + Orval config
|   |   |-- api-zod/                # Generated Zod schemas
|   |   `-- db/                     # Drizzle ORM schema + DB connection
|   |-- scripts/                    # Deployment utility scripts
|   |-- pnpm-workspace.yaml         # pnpm workspace package locations
|   |-- tsconfig.base.json          # Shared TypeScript options
|   |-- tsconfig.json               # TypeScript project references
|   `-- package.json                # Workspace orchestration scripts
`-- frontend/
    |-- app/                        # React + Vite website and admin UI
    |-- mockup-sandbox/             # Visual component preview
    `-- packages/api-client-react/  # Generated React Query hooks
```

## TypeScript & Composite Projects

Every package extends `backend/tsconfig.base.json` which sets `composite: true`. The backend workspace `tsconfig.json` lists shared packages as project references. This means:

- **Always typecheck from `backend/`** - run `pnpm run typecheck`. This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Workspace Scripts

- `pnpm run build` - runs `typecheck`, then builds the frontend and backend
- `pnpm run typecheck` - runs TypeScript project references plus app typechecks

## Packages

### `api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /healthz` (full path: `/api/healthz`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/server/index.mjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `packages/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `packages/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `../frontend/packages/api-client-react/src/generated/` - React Query hooks + fetch client
2. `packages/api-zod/src/generated/` - Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `packages/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `../frontend/packages/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `api-server` CMS routes

CMS content is stored in `api-server/src/data/`:
- `home.draft.json` — current draft content
- `home.published.json` — live published content

Routes under `GET/PUT/POST /api/cms/home`:
- `GET /api/cms/home` — returns published content (public homepage reads this)
- `GET /api/cms/home/draft` — returns draft (admin panel reads this)
- `PUT /api/cms/home/draft` — save draft
- `POST /api/cms/home/publish` — publish draft to live
- `POST /api/cms/home/unpublish` — revert to draft
- `POST /api/cms/home/reset` — reset all content to defaults

### `../frontend/app` (`@workspace/adt-softtech`)

ADT SoftTech enterprise website built with React + Vite + TailwindCSS v4.

- **Pages**: Home, About, Services, Products, Case Studies (was Portfolio), Articles, Free Services, Support, Contact, Client Portal, Privacy Policy, Terms & Conditions, Search
- **Features**: Dark/light mode toggle, 3D AI particle canvas background, rotating featured content, search functionality, 3D card hover effects, WhatsApp floating button (bottom-left), 15 client testimonials carousel, animated WebP hero background, glassmorphism floating cards, leadership portrait gradient frames
- **Brand**: Primary #2563EB, Cyan Accent #38BDF8, Dark #0F172A
- **Fonts**: Poppins (headings), Inter (body)
- **Logo**: `public/brand-logo.gif` (animated GIF brand logo, used in navbar and footer)
- **Hero BG**: `public/hero-bg.webp` (optimized animated WebP, converted from 129MB GIF to ~3.7MB)
- **Team**: Rana Muhammad Tehseen (Founder & CEO), Allah Ditta Saim (Co-Founder & CTO)
- **Contact**: adtsofttech@gmail.com, WhatsApp: +92 331 720 3878
- **Stats**: 50+ Projects, 30+ Clients, 5+ AI Products, 99% Client Satisfaction
- **Products**: Support AI Agent, NewsifyX (YouTube summarizer), Business Analytics Agent, HR Screening Agent, Automation Assistant, AI Knowledge Bot
- **Case Studies**: 13 projects total (10 data/analytics dashboards with Topmate links, plus AI bot, HR automation, FinTech app); search bar, category filters, load-more system, "Get" links to Topmate
- **Testimonials**: 15 client testimonials with auto-rotating carousel and manual navigation
- **Admin Panel**: separate from public site, `/admin` (dashboard), and page editors:
  - `/admin/home` — Hero, Stats, Showcase, Free Services, Testimonials, Industries, Navbar, Footer
  - `/admin/about` — Hero (with image upload), Mission/Vision cards, Founders (with photo upload), Team, Stats, Values
  - `/admin/services` — Hero, Services grid (with features), Pricing plans, CTA section
  - `/admin/products` — Hero, Live Products (with image upload), Portfolio Products (with image upload)
  - Workflow: Save Draft → Publish to Live; Unpublish, Reset to Defaults
  - Image upload: POST /api/cms/upload (multer), served at /api/cms/uploads/:filename
- **CMS Types**: `src/lib/home-types.ts` (home), `src/lib/cms-types.ts` (about/services/products)
- **CMS Defaults**: `src/lib/home-defaults.ts` (home), `src/lib/cms-defaults.ts` (about/services/products)
- **Admin Components**: `src/components/admin-layout.tsx`, `src/components/admin-image-upload.tsx`
- **Public pages fetch from API**: About ← /api/cms/about, Services ← /api/cms/services, Products ← /api/cms/products

#### i18n / Multilingual System

- **Packages**: `react-i18next`, `i18next` installed in `../frontend/app`
- **Init**: `src/i18n/index.ts` — initialises i18next with all locale bundles imported inline (no lazy loading)
- **Locales**: `src/i18n/locales/{en,fr,ar,ur,it}/{common,home,about,services,products,admin}.json` — 30 files total
- **Context**: `src/context/LanguageContext.tsx` — wraps i18next, applies RTL `dir` attribute to `<html>`, reads direction from dynamically loaded language list (API-first, falls back to built-in list), persists to `localStorage`
- **Switcher**: `src/components/language-switcher.tsx` — flag + native name dropdown in the header (compact globe icon on mobile)
- **RTL languages**: Arabic (`ar`), Urdu (`ur`) — direction also derived from the language record in the admin, so new RTL languages added via UI work without code changes
- **Admin panel**: `/admin/languages` — full Language Management CRUD page with translation editor, namespace tabs, missing-key detection, and duplicate-from feature
- **API routes** (api-server):
  - `GET/POST/PUT/DELETE /api/cms/languages` — language CRUD; `POST /api/cms/languages/:code/set-default`
  - `GET /api/cms/translations/:locale/:ns` — read namespace; `PUT` to update; `POST /api/cms/translations/duplicate/:from/:to`
  - Language data stored at `api-server/src/data/languages.json`; translation overrides at `api-server/src/data/translations/{locale}/{ns}.json`
- **To add a new language without code changes**: go to `/admin/languages`, click "Add Language", enter locale code, name, native name, flag emoji, and direction.

### `backend/scripts`

Deployment utility scripts live here. Replit runs `post-merge.sh` after dependency updates.

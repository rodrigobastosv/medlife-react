# MedLife (React)

Port of the Flutter MedLife app to a React web app, against the **same Supabase
project** — same tables, same row-level security, same accounts. Nothing in
`../medlife` was changed, and no migration needs to be re-run.

```bash
cp .env.example .env   # or reuse the values already in .env
npm install
npm run dev            # http://localhost:3000
```

The port is fixed at 3000 for the same reason the Flutter app pins it: Supabase
only redirects e-mail confirmation links to URLs on its allow-list, and a random
port is never on it.

| Script                   | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | dev server with hot reload                    |
| `npm run build`          | type-check (`tsc -b`) then a production build |
| `npm run lint`           | oxlint                                        |
| `npx prettier --write .` | format                                        |

---

## How to read this codebase

The layering is the same as the Flutter app's, so the two can be compared file by
file. Dependencies point **downward only** — a component never reaches past the
layer below it.

```
src/
  domain/          types, enums and pure rules. No React, no Supabase.
  data/            repositories: the only place that talks to Supabase.
  features/        one folder per feature: query hooks + pages + components.
  design-system/   tokens and reusable UI primitives. Knows no domain types.
  app/             providers, routing, guards, the shell.
  core/            env, the Supabase client, formatting, errors.
```

Two rules carry most of the weight:

1. **Only `src/data/` imports the Supabase client.** Features call repositories;
   repositories run the queries and map rows to domain objects. So a column
   rename touches one file, and a page can be read without knowing PostgREST.
2. **Only `src/domain/` holds business rules.** Whether an invoice is pending,
   how "new patients" are counted, how a month's revenue is bucketed — all pure
   functions, testable without a browser or a server.

### Where the Flutter concepts went

| Flutter / Dart                      | Here                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| Cubit + state class                 | `useQuery` / `useMutation` (server state) + `useState` (UI state)  |
| `PresentationCubit` loading events  | `isPending` from the query; a skeleton or a spinner                |
| `emitPresentation(XError(...))`     | a thrown `AppError`, shown by the page as a toast                  |
| `Result<MLError, T>` + `.when(...)` | the promise rejects and Query catches it — see `core/errors.ts`    |
| `GetIt` / `G<T>()`                  | plain imports, and React context for what is genuinely per-session |
| `SessionService` (a singleton)      | `SessionProvider` + `ownerId` in every query key                   |
| `MLPage`, `MLShell`                 | `AppShell` + route layouts                                         |
| `AppRoute` enum                     | `app/routing/routes.ts`                                            |
| go_router `redirect`                | guard components (`RequireAuth`, `RequireDoctor`, …)               |
| `MLColors` / `MLSpacing` / theme    | CSS custom properties + Tailwind's `@theme`, in `src/index.css`    |
| `MLCard`, `MLTag`, `MLEmptyState`   | `design-system/components/*`                                       |
| use case classes                    | pure functions in `domain/` (e.g. `buildMonthlyReport`)            |

**Use cases did not survive as classes, on purpose.** In the Flutter app a use
case is a class with one `call` method, and it exists so a cubit can depend on
something injectable. Here the same logic is a plain exported function — what the
class was buying (a seam for testing and swapping) is what a module already is in
JavaScript, and a wrapper around one function would be ceremony. The rules
themselves moved across unchanged, into `domain/`.

### Two decisions worth understanding before changing anything

**Every query key contains `ownerId`** (`features/query-keys.ts`). A secretary
can be linked to several doctors, so "whose data is this" is part of a query's
identity. Leave the id out of a key and switching doctors serves the previous
doctor's cached rows — the request is not even made, because the cache believes
it already has the answer.

**The finance split is a database rule, not a UI one.** Money lives in
`appointment_finances`, a separate table, because RLS filters _rows_ and not
_columns_ — that is the only way the database can express "the secretary sees the
appointment but not the amount". Hiding the financial block in the form is UX;
what protects it is the policy. So `finance === null` means either "nothing
recorded" or "you are not allowed to see it", and the UI decides what to render
from the **role**, never from the null.

### What changed on purpose

- **The appointment form is addressed by URL** (`/patients/:id/appointments/new`)
  rather than handed an object through navigation state. The Flutter version
  passes it through go_router's `extra`, which does not survive a reload — so
  those routes need a redirect for the missing case. Putting the ids in the path
  removes the problem instead of handling it: the form reloads and deep-links.
- **The patient list has a search box** filtering on name, CPF and phone, with
  accents folded so "Jose" finds "José".
- **The rail's collapse toggle is gone.** The sidebar is either shown or replaced
  by a drawer, decided by viewport width in CSS.

---

## PWA

The app installs. On desktop Chrome that is the install button in the address
bar; on Android it is the install banner; on iOS it is _Compartilhar → Adicionar
à Tela de Início_, which ignores the manifest and reads the `apple-*` tags in
`index.html` instead — that is why those are duplicated by hand there.

`vite-plugin-pwa` generates `manifest.webmanifest` and a Workbox service worker
at build time. Three decisions in `vite.config.ts` are worth knowing:

- **Updates are offered, not applied.** `registerType: 'prompt'` — the new worker
  waits and `PwaUpdatePrompt` asks. `autoUpdate` would swap the bundle under a
  half-filled appointment form, and this app is used during consultations.
  An open tab re-checks hourly, because the browser only checks on navigation and
  a SPA left open all day never navigates.
- **Supabase is never cached.** The runtime caching list covers the Google Fonts
  stylesheet and font files and nothing else. A cached response is a copy of a
  patient's data that outlives the sign-out meant to remove it, so everything
  else goes to the network; TanStack Query already holds the in-memory copy.
  What the worker precaches is the shell — the built assets and `index.html` —
  which is what makes a deep link work offline, where there is no Firebase
  rewrite to fall back on.
- **The service worker is off in `npm run dev`**, or it fights HMR. Flip
  `devOptions.enabled` to exercise the update prompt locally, then run
  `npm run build && npm run preview` to see the real thing.

Firebase serves `sw.js` and `manifest.webmanifest` with `Cache-Control:
no-cache`. A cached `sw.js` is an app stuck on the old version — the browser
decides whether an update exists by comparing that file byte for byte, so a stale
copy from the CDN reads as "nothing new".

The icons in `public/icons/` are generated from the two SVG sources beside them:

```bash
cd public/icons
sips -s format png --resampleHeightWidth 192 192 icon.svg --out icon-192.png
sips -s format png --resampleHeightWidth 512 512 icon.svg --out icon-512.png
sips -s format png --resampleHeightWidth 512 512 icon-maskable.svg --out icon-maskable-512.png
sips -s format png --resampleHeightWidth 180 180 icon.svg --out apple-touch-icon.png
```

`icon-maskable.svg` is not a copy of `icon.svg` at another size: Android crops an
installed icon to the launcher's shape and only the central 80% survives, so the
mark is drawn smaller inside the same plate.

---

## Backend

Shared with the Flutter app. If the database has not been set up yet, run the
migrations in `../medlife/supabase/migrations/` in order (`schema.sql`,
`002_secretaries_and_roles.sql`, `003_fix_profile_relationships.sql`) and follow
the Auth settings in that project's README — e-mail confirmation must stay
**on**, and `http://localhost:3000/**` must be in the redirect allow-list.

Then run `supabase/migrations/004_appointment_scheduled_time.sql` **from this
repository**. It is the first schema change that originated here rather than in
the Flutter app, which is why there is now a `supabase/` directory on this side
too; the earlier ones still live only in `../medlife`. It is additive — a
`scheduled_time` column — precisely so the Flutter app keeps working untouched.
Because the database is shared, **any change here has to be safe for that app
as well**: converting `scheduled_date` to `timestamptz` would have silently
broken its date-range queries, which is why it was not done.

## Stack, and why

- **Vite + React 19 + TypeScript (strict).** `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are on: array access is typed as possibly
  undefined, and "absent" stays distinct from "explicitly undefined".
- **TanStack Query** for everything that comes from the server — caching,
  refetching and invalidation are the bulk of what a cubit does by hand.
- **React Router**, with guards as layout routes.
- **react-hook-form + Zod.** The schema is the validation _and_ the form's
  TypeScript type; add a field to the schema and the compiler asks for it.
- **Tailwind CSS v4**, driven by the ported design tokens. Components carry no
  `dark:` prefixes: the token layer flips, so `bg-surface` is simply correct in
  both themes — the same thing asking Flutter for `colorScheme.surface` does.
- **No chart library and no icon library.** Both are a handful of divs and SVG
  paths here — the "own the look" call the Flutter app already makes.

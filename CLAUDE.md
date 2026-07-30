# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # dev server on http://localhost:3000 (port is fixed — see below)
npm run build            # tsc -b, then vite build. This is the type-check.
npm run lint             # oxlint
npx prettier --check .   # CI runs this; --write to fix
```

**There is no test runner.** No vitest, no jest, no test files. `npm run build`
is the only automated gate besides lint and formatting, and CI runs exactly
those three. To verify domain logic, run the real module through `jiti` (it is
already installed) with the `@` alias mapped to `src`, rather than
reimplementing the logic in a scratch script — a second copy can agree with
itself and still be wrong.

The dev port is pinned to 3000 in `vite.config.ts`, because Supabase only
redirects e-mail confirmation links to URLs on its allow-list and a random port
is never on it. Do not change it.

`/preview.html` renders design-system specimens in both themes with fake data
and **no Supabase session** — it is the only way to see UI without logging in.
Authenticated screens cannot be exercised in a headless browser here.

## Architecture

Port of a Flutter app (`../medlife`) against the **same Supabase project** —
same tables, same RLS, same accounts. The Flutter repo also holds the
migrations (`../medlife/supabase/migrations/`); there is no `supabase/`
directory here. The layering mirrors the Flutter app's so the two can be read
side by side. Dependencies point **downward only**.

```
src/
  domain/          types, enums, pure rules. No React, no Supabase.
  data/            repositories: the only place that talks to Supabase.
  features/        one folder per feature: query hooks + pages + components.
  design-system/   tokens and UI primitives. Knows no domain types.
  app/             providers, routing, guards, the shell.
  core/            env, Supabase client, formatting, errors.
```

Two rules carry most of the weight:

1. **Only `src/data/` imports the Supabase client.** Features call repositories;
   repositories run queries and map rows to domain objects.
2. **Only `src/domain/` holds business rules** — as plain exported functions,
   not classes. Use cases deliberately did not survive as classes: a module is
   already the seam a use-case class was buying.

### Things that will bite you if you don't know them

**Every query key contains `ownerId`** (`features/query-keys.ts`). A secretary
can be linked to several doctors, so "whose data is this" is part of a query's
identity. Omit it and switching doctors serves the previous doctor's cached rows
— no request is even made. Keys are hierarchical so invalidating a prefix
invalidates everything under it.

**`ownerId` is not the logged-in user.** A doctor owns their data; a secretary
operates on a doctor's data. Repositories take a `Scope { ownerId,
canSeeFinances }` from `useDataScope()`, which throws if called outside the
authenticated layout — the impossible null is asserted once instead of handled
everywhere.

**The finance split is a database rule, not a UI one.** Money lives in a
separate `appointment_finances` table because RLS filters _rows_, not _columns_
— that is the only way the database can express "the secretary sees the
appointment but not the amount". So `finance === null` means either "nothing
recorded" _or_ "you may not see it": decide what to render from the **role**,
never from the null. Hiding the finance block in the form is UX; the policy is
what protects it.

**The database is shared with the Flutter app** (`../medlife`), which is alive
and reads the same tables. A schema change here has to be safe _there_ too:
`appointments.scheduled_date` stayed a `date` and gained a separate
`scheduled_time` column precisely because converting it to `timestamptz` would
have silently broken the Flutter app's `.lte('scheduled_date', to)` range
queries. Prefer additive columns. Migrations that originate here live in
`supabase/migrations/`; the older ones only exist in `../medlife`.

**`scheduled_time` is nullable in the database but required by the form.** The
null means "recorded before the column existed", not "allowed to be empty" —
render the missing time as absent rather than as a placeholder.

**Route guards are layout routes** (`app/routing/guards.tsx`) rendering
`<Outlet />` or `<Navigate />`, not `if`s inside pages — so the rule is declared
once in the route table and cannot be forgotten on a new screen. `RequireAuth`
has three states, not two; redirecting during `loading` bounces signed-in users
to sign-in on every reload.

**Paths are never string literals.** `app/routing/routes.ts` exports builders
(`routes.patient(id)`); `routePatterns` holds the `:param` forms for the router.
The appointment form is addressed entirely by URL rather than via navigation
state, so it survives a reload and deep-links.

## Conventions

- **Comments explain _why_, in full prose.** This codebase has an unusually high
  commentary standard — decisions, trade-offs and rejected alternatives are
  written down at the point they were made. Match that register; do not add
  noisy line-by-line narration of _what_ the code does.
- **UI strings are Brazilian Portuguese.** Code, identifiers and most comments
  are English (`preview-specimens.tsx` and the CI workflow are pt-BR). Watch
  agreement when composing strings from parts.
- **TypeScript is strict plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.** Array access is `T | undefined`, and "absent"
  stays distinct from "explicitly undefined". Do not weaken types with `any` or
  casts to get past it.
- **Tailwind v4, no `dark:` prefixes.** The token layer flips, so `bg-surface`
  is correct in both themes. Use the semantic tokens (`bg-surface-container`,
  `text-on-surface-variant`, `rounded-l`, `nums`, `font-display`) from
  `src/index.css` — not raw colours.
- **No chart library and no icon library.** Charts are divs, icons are inline
  Material Symbols paths using `currentColor`. Extend `BarChart` or `icons.tsx`
  rather than adding a dependency.
- **`cn()` is clsx + tailwind-merge**, so a caller's `className` reliably beats
  a component's default. Components accept `className` for this reason.
- Server state is TanStack Query; UI state is `useState`. `react-hook-form` +
  Zod, where the schema is both the validation and the form's type.

## Deploy

CI (`.github/workflows/ci.yml`) runs prettier, lint and build on every PR, and
on merge to `main` builds with real `VITE_*` secrets, deploys to Firebase
Hosting, and smoke-tests `/` and a deep link. The `VITE_*` values are inlined
into the bundle and are **public** — that is by design, since the Supabase
publishable key is protected by RLS. Never let a `service_role` key near
`core/env.ts`.

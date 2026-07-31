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

Then run the migrations in `supabase/migrations/` **from this repository**, in
order:

- `004_appointment_scheduled_time.sql` — the first schema change that originated
  here rather than in the Flutter app, which is why there is now a `supabase/`
  directory on this side too; the earlier ones still live only in `../medlife`.
- `005_notifications.sql` — `appointments.created_by`, and the
  `notification_preferences` table behind the Notificações card in Ajustes.
- `006_web_push.sql` — `push_subscriptions` and `notification_deliveries`, so the
  server can reach a closed app. See [Notifications](#notifications) for the rest
  of that setup, which also needs VAPID keys and a cron job.
- `007_patients_unique_cpf.sql` — one CPF per patient inside each doctor's
  register. **Run the audit query in its header first**: `create unique index`
  fails if duplicates already exist, and which of two split records is the good
  one is a question for whoever attends the patient, not for the schema. The file
  says what to do with whatever the query returns.

They are all additive, precisely so the Flutter app keeps working untouched. Because
the database is shared, **any change here has to be safe for that app as well**:
converting `scheduled_date` to `timestamptz` would have silently broken its
date-range queries, which is why it was not done.

## Notifications

Opt-in, configured per user in Ajustes, and delivered by **Web Push** — so they
arrive with the app closed. That is the whole point of the mechanism: a
notification fired by the page can only happen while the page exists, and an
installed PWA is still a page. What wakes a closed app is the browser's push
service, and only a server can talk to it.

The shape of it:

```
pg_cron  ──every minute──▶  supabase/functions/notify
                                 │  plan.ts     what is due (pure)
                                 │  queries.ts  the reads, service_role
                                 └▶ push.ts     VAPID, @negrel/webpush
                                        │
                          push service (Google / Mozilla / Apple)
                                        │
                          public/sw-notifications.js  ── showNotification()
```

`plan.ts` is one pure function over a snapshot, which is what lets the rules be
exercised with a fabricated clock instead of by waiting for one — the only
practical way to check "at 07:29", "at 07:30" and "at 07:31 again". It used to
run in the browser and was **moved** here, not copied: two copies of a rule are
two rules the moment one is edited.

Deduplication is `notification_deliveries`, whose primary key is the dedupe key.
Claiming and recording are one `on conflict do nothing ... returning`, so two
overlapping cron runs cannot both send the same notification.

Two things follow from push being per-browser rather than per-account: the
switches in Ajustes belong to the **account**, but permission and the
subscription belong to each **browser** — so the same person authorises once on
the phone and once on the desktop. And on iPhone there is no push at all until
the app has been added to the home screen.

Notifications do not work under `npm run dev`: they arrive through the service
worker, and the worker is disabled there (it fights HMR). Use `npm run build &&
npm run preview`.

### Setting it up

One-time, per Supabase project.

**1. Generate the VAPID key pair.** It identifies this application server to
every push service; the pair is generated once and then never changes, because
rotating it invalidates every existing subscription.

```bash
deno run -A https://raw.githubusercontent.com/negrel/webpush/master/cmd/generate-vapid-keys.ts
```

**2. Give the public half to the frontend.** `VITE_VAPID_PUBLIC_KEY` in `.env`,
and as a GitHub secret of the same name for the deploy build. Public by design —
see the note in `.env.example`.

**3. Give the whole pair to the function**, along with a contact address the push
services can use to reach you, and a shared secret so the endpoint is not open to
the internet.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set --project-ref <project-ref> \
  VAPID_KEYS="$(python3 -c "import json;print(json.dumps(json.load(open('supabase/.vapid.json'))))")" \
  VAPID_CONTACT="mailto:voce@exemplo.com" \
  NOTIFY_SECRET="$(cat supabase/.notify-secret.txt)"
npx supabase functions deploy notify --project-ref <project-ref> --no-verify-jwt
```

Both key files are gitignored, and the JSON is compacted onto one line because a
multi-line secret value is where dotenv-style parsing tends to truncate.

`--no-verify-jwt` is deliberate. Supabase puts its own JWT check in front of a
function by default, which here would mean two gates gating the same thing: the
caller is `pg_cron`, not a signed-in user, and there is no session for it to
present. Leaving it on means either sending the (public) anon key along for no
benefit, or debugging a 401 from the platform that looks exactly like a 401 from
the function's own check. `NOTIFY_SECRET` is what protects this endpoint, and
this makes that the whole truth rather than half of it.

The function's own `deno.json` sits **inside** `supabase/functions/notify/`, not
beside it. The remote bundler only uploads what is in the function's directory,
so an import map one level up is silently absent at build time and every bare
specifier fails to resolve.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform and
do not need setting. The service role key bypasses RLS, which is exactly why the
function needs it and exactly why it must never reach a `VITE_` variable.

**4. Run the migrations** `005_notifications.sql` and `006_web_push.sql` in the
SQL Editor, then enable the two extensions and schedule the job. Read the shared
secret back with `cat supabase/.notify-secret.txt` — it is deliberately never
printed by the commands above:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<NOTIFY_SECRET>', 'notify_secret');

select cron.schedule('notify-every-minute', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

Every minute, because that is the resolution of what is being decided: the
summaries are configured to the minute and the reminder lead times are 15, 30 and
60 of them. A run with nothing due is four small queries and no writes.

The delivery log also needs pruning — the statement is commented at the bottom of
`006_web_push.sql`.

**Checking on it.** `select * from cron.job_run_details order by start_time desc
limit 20;` for whether the job fired, and the function logs in the dashboard for
what it decided; each run returns a summary of `{candidates, planned, sent,
skipped, removed}`.

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

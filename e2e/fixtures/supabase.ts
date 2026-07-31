import { expect, test as base, type BrowserContext, type Page, type Route } from '@playwright/test';

/**
 * A Supabase that never leaves the browser.
 *
 * Every request the app makes to `/auth/v1/*` and `/rest/v1/*` is answered here,
 * from data the test declares. Nothing reaches a real project.
 *
 * The interception point matters. The obvious alternative — write a session into
 * `localStorage` and skip the sign-in screen — couples the suite to
 * `supabase-js`'s private storage format, which is an implementation detail that
 * has already changed once (it is base64-wrapped in recent versions). Answering
 * the *token endpoint* instead means the real client does its real thing: it
 * parses the response, stores it however it likes, starts its refresh timer and
 * emits `onAuthStateChange`. The test drives the actual sign-in form, and the
 * only thing that is fake is the server.
 */

export interface StubTables {
  profiles?: Record<string, unknown>[];
  doctor_secretaries?: Record<string, unknown>[];
  patients?: Record<string, unknown>[];
  appointments?: Record<string, unknown>[];
  notification_preferences?: Record<string, unknown>[];
  push_subscriptions?: Record<string, unknown>[];
}

export interface SupabaseStub {
  /** Rows each table returns. Mutate between navigations to change the answer. */
  tables: StubTables;
  /** Every write the app attempted, in order — what a test asserts a save with. */
  writes: { table: string; method: string; body: unknown }[];
  /** Fills and submits the sign-in form, then waits for the app shell. */
  signIn: (options?: { role?: 'doctor' | 'secretary' }) => Promise<void>;
}

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_DOCTOR_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Far enough out that the client's refresh timer never fires mid-test. A short
 * expiry here produces the worst kind of flake: a token refresh races the
 * assertions, and the test fails on timing rather than on behaviour.
 */
const ONE_DAY = 24 * 60 * 60;

function sessionBody(userId: string) {
  return {
    access_token: 'stub-access-token',
    token_type: 'bearer',
    expires_in: ONE_DAY,
    expires_at: Math.floor(Date.now() / 1000) + ONE_DAY,
    refresh_token: 'stub-refresh-token',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'teste@medlife.test',
      email_confirmed_at: new Date().toISOString(),
      user_metadata: { display_name: 'Dra. Teste' },
      app_metadata: { provider: 'email' },
      created_at: new Date().toISOString(),
    },
  };
}

/** `/rest/v1/patients?select=...` → `patients`. */
const tableOf = (url: string): string =>
  new URL(url).pathname.replace(/^.*\/rest\/v1\//, '').split('?')[0] ?? '';

export const test = base.extend<{ supabase: SupabaseStub }>({
  // The second argument is named `provide`, not the conventional `use`: oxlint's
  // rules-of-hooks reads a bare `use(...)` call as React 19's `use` hook and
  // fails the lint. The name is ours to choose — Playwright passes it
  // positionally — so renaming it is a real fix rather than a suppression.
  //
  // Routing happens on the *context* rather than on the page. Identical for the
  // single page almost every test drives, but a link with `target="_blank"`
  // opens a second one, and a `page.route` handler does not follow it — the new
  // tab would be the only thing in the suite talking to a real host.
  supabase: async ({ context, page }: { context: BrowserContext; page: Page }, provide) => {
    const stub: SupabaseStub = {
      tables: {},
      writes: [],
      signIn: async () => {
        /* replaced below */
      },
    };

    await context.route('**/auth/v1/**', async (route: Route) => {
      const url = route.request().url();

      // Sign-out has to answer 2xx or the client keeps the session and the app
      // never leaves the authenticated shell.
      if (url.includes('/logout')) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      if (url.includes('/token') || url.includes('/signup')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sessionBody(TEST_USER_ID)),
        });
        return;
      }

      if (url.includes('/user')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sessionBody(TEST_USER_ID).user),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await context.route('**/rest/v1/**', async (route: Route) => {
      const request = route.request();
      const table = tableOf(request.url());
      const method = request.method();

      if (method !== 'GET' && method !== 'HEAD') {
        let body: unknown = null;
        try {
          body = request.postDataJSON();
        } catch {
          body = request.postData();
        }
        stub.writes.push({ table, method, body });

        // Echoed back so `.select().single()` after an insert or upsert resolves
        // rather than hanging the mutation forever.
        //
        // With the columns the *database* fills in put back first. PostgREST
        // answers a write with the row as stored, which always carries its
        // primary key and `created_at`; echoing only what the app sent hands the
        // mapper a row with neither, and `fromDateColumn(undefined)` throws — so
        // a perfectly good save would fail here for a reason that exists nowhere
        // but in the stub. Defaults lead, so anything actually sent still wins.
        const echoed = Array.isArray(body) ? body[0] : body;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: `stub-${table}-id`,
            created_at: new Date().toISOString(),
            ...(echoed as Record<string, unknown> | null),
          }),
        });
        return;
      }

      const rows =
        (stub.tables as Record<string, Record<string, unknown>[] | undefined>)[table] ?? [];

      // `select('id', { count: 'exact', head: true })` — the patient counter.
      // PostgREST answers a HEAD with an empty body and puts the number in
      // `content-range`, which is where supabase-js reads `count` from.
      if (method === 'HEAD') {
        await route.fulfill({
          status: 200,
          headers: { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
          body: '',
        });
        return;
      }

      // `.single()` and `.maybeSingle()` ask for an object rather than an array
      // via this Accept header. Returning an array to them makes supabase-js
      // fail with a shape error that reads nothing like the real cause.
      const wantsObject = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
        body: JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
      });
    });

    stub.signIn = async ({ role = 'doctor' } = {}) => {
      stub.tables.profiles ??= [
        { id: TEST_USER_ID, role, full_name: role === 'doctor' ? 'Dra. Teste' : 'Sec. Teste' },
      ];

      await page.goto('/auth/sign-in');
      await page.getByLabel('E-mail').fill('teste@medlife.test');
      await page.getByLabel('Senha').fill('naoimporta');
      await page.getByRole('button', { name: /entrar/i }).click();

      // Waited for, rather than left to the next assertion. Signing in is
      // asynchronous twice over — the token call, then the profile read the
      // session provider needs before it will report `ready` — so returning
      // early hands every caller a page that is still on the sign-in screen.
      await page.waitForURL((url) => !url.pathname.startsWith('/auth'));
    };

    await provide(stub);
  },
});

export { expect } from '@playwright/test';

/**
 * The main navigation, opening the drawer first if this viewport uses one.
 *
 * The shell renders a permanent sidebar at `lg:` and a drawer below it, and the
 * sidebar is `hidden lg:flex` — genuinely absent from the DOM on a narrow
 * screen, not merely invisible. A test that reaches straight for the nav
 * therefore passes on desktop and fails on mobile, which is precisely the
 * difference the mobile project exists to find.
 */
export async function openNavigation(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  const menuButton = page.getByRole('button', { name: 'Abrir menu' });

  // Wait for the shell to exist *before* asking which layout it is. `isVisible()`
  // does not wait — it answers about this instant — so checking it straight after
  // a navigation reads "no sidebar" from a page that has not rendered yet, and
  // then goes looking for a drawer button that a desktop viewport never has.
  // Whichever of the two appears is the answer.
  await expect(nav.or(menuButton).first()).toBeVisible();

  // Which layout is decided by the page, not by comparing the viewport against a
  // hard-coded breakpoint — that number lives in CSS, and a copy of it here is a
  // copy that will not be updated with it.
  if (!(await nav.isVisible())) await menuButton.click();

  await expect(nav).toBeVisible();
  return nav;
}

/**
 * Forces `Notification.permission` to `denied`.
 *
 * Playwright can grant a permission but has no API to refuse one, and the
 * `denied` branch is the one carrying the sharpest rule in the card — so it is
 * stubbed at the only place that can express it. Installed before any script
 * runs, because the app reads the value during its first render.
 */
export async function denyNotifications(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', {
      get: () => 'denied',
      configurable: true,
    });
  });
}

import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * Two decisions shape everything here, and both exist to keep these tests
 * runnable by anyone, on any machine, without credentials.
 *
 * **1. No Supabase, ever.** Every test stubs the network at the browser (see
 * `e2e/fixtures/supabase.ts`). The database this app talks to is shared with a
 * live Flutter app and holds real patients; a test suite that signs in and
 * writes to it is one careless `delete` away from being the worst kind of
 * incident. Stubbing also makes a run deterministic — no shared fixtures to
 * collide over, nothing to reset between runs, and a failure means the code
 * changed rather than that somebody edited a row.
 *
 * **2. The dev server, not `preview`.** Counter-intuitive for an e2e suite, but
 * the production build registers a service worker, and a service worker sits in
 * front of `fetch` — exactly where Playwright's request interception lives. The
 * two fight, and the failures are intermittent and awful to read. The worker is
 * off in `npm run dev` (see `vite.config.ts`), so this is the configuration in
 * which the stubs are actually in charge.
 */
export default defineConfig({
  testDir: './e2e',
  // Every test navigates and asserts against a fresh page; nothing is shared, so
  // there is no reason to serialise them.
  fullyParallel: true,
  // A `test.only` left in a commit passes locally and silently stops running
  // everything else in CI. Failing the run is the only way that gets noticed.
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 2,
  reporter: process.env['CI'] === undefined ? 'list' : [['github'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    /*
      The full Chromium in its new headless mode, not the default
      `chromium-headless-shell`.

      The shell is a stripped-down build, and one of the things it leaves out
      matters here: `context.grantPermissions(['notifications'])` has no effect
      on it — `Notification.permission` stays `denied` no matter what, so the
      whole granted branch of the notification card is unreachable. Verified by
      running the same page on both. The cost is a slower start and a bigger
      download in CI; the benefit is that the browser behaves like the one
      people use.
    */
    channel: 'chromium',
    // Kept only for a test that failed, and only on the retry — the first run
    // stays fast and a green suite leaves no artefacts behind.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The app decides its layout by viewport width alone (the `lg:` prefix is
      // the whole breakpoint system), so the mobile pass is not a formality:
      // it exercises the drawer navigation, which the desktop pass never sees.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: process.env['CI'] === undefined,
    // Placeholders, and that is the point: `core/env.ts` throws at startup if
    // these are missing, but nothing here ever reaches Supabase. Fake values
    // mean the suite needs no secrets, which in turn means it runs on pull
    // requests from forks — where secrets are deliberately unavailable.
    env: {
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'stub-publishable-key',
      VITE_VAPID_PUBLIC_KEY:
        'BErumvIxpT_pRW7kH-0galRm-gubuWYGucGHNYNWZAV4jqFJSLnJ_lE3BdmPTVIZrjTkQxSt0MNpjy6SQrfvCiM',
    },
    timeout: 120 * 1000,
  },
});

import { expect, test } from './fixtures/supabase';

/**
 * The offline banner.
 *
 * `context.setOffline(true)` is the real thing rather than a dispatched event:
 * Chromium flips `navigator.onLine` and fires `offline` at the page exactly as a
 * dropped connection does, so what is under test is the hook's subscription and
 * not a mock of it.
 *
 * Nothing here navigates while offline, deliberately. The route chunks are lazy
 * and the suite runs against the dev server with the service worker off, so a
 * navigation with the network down fails on a missing chunk — a property of the
 * *test* environment rather than of the app, and asserting around it would only
 * encode the difference. For the same reason the "opened offline" case stubs
 * `navigator.onLine` instead of reloading: the document itself comes over the
 * network here, and in production it comes from the precache.
 */

const OFFLINE_MESSAGE = 'Sem conexão. Os dados podem estar desatualizados.';

test('going offline says so, and coming back stops saying it', async ({ page, context }) => {
  await page.goto('/auth/sign-in');
  await expect(page.getByText(OFFLINE_MESSAGE)).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(OFFLINE_MESSAGE)).toHaveCount(0);
});

test('the app opened offline shows the banner on its first paint', async ({ page }) => {
  // Installed before any script runs, so the very first render reads `false`.
  // This is the case `useSyncExternalStore` exists for: read in an effect
  // instead, the first paint claims online and corrects itself a frame later,
  // and the flash lands on the one user guaranteed to be looking for it.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
  });

  await page.goto('/auth/sign-in');
  await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();
});

test('the message is announced politely rather than interrupting', async ({ page, context }) => {
  await page.goto('/auth/sign-in');
  await context.setOffline(true);

  // The live region is the container, not the text node — a screen reader has to
  // be told the message arrived at all, and `polite` is what keeps it from
  // cutting across whatever is being read.
  const region = page.getByText(OFFLINE_MESSAGE).locator('xpath=ancestor::*[@aria-live][1]');
  await expect(region).toHaveAttribute('aria-live', 'polite');
});

test('the shell stays on screen underneath the banner', async ({ page, context, supabase }) => {
  supabase.tables.patients = [];
  await supabase.signIn();

  await context.setOffline(true);
  await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();

  // An outage explains the screen; it does not replace it. Either half of the
  // navigation counts, because which one exists is the viewport's decision — the
  // sidebar is genuinely absent from the DOM below `lg:`, not merely hidden.
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  const menuButton = page.getByRole('button', { name: 'Abrir menu' });
  await expect(nav.or(menuButton).first()).toBeVisible();
});

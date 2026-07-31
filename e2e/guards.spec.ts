import { expect, openNavigation, test } from './fixtures/supabase';

/**
 * The route guards, which are the app's access control as far as the UI is
 * concerned. They are declared once in the route table (`app/routing/guards.tsx`)
 * precisely so a new screen cannot forget them — and that only holds if
 * something checks the declaration still works.
 */

test('a deep link while signed out lands on sign-in, not on the page', async ({
  page,
  supabase,
}) => {
  void supabase;
  await page.goto('/patients/some-patient-id');

  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await expect(page.getByLabel('E-mail')).toBeVisible();
});

test('signing in returns you to where you were headed', async ({ page, supabase }) => {
  supabase.tables.patients = [];

  // The guard stores the attempted path in navigation state so the round trip
  // through sign-in is invisible. Landing on the home screen instead would be a
  // silent regression — nothing errors, the user is just somewhere else.
  await page.goto('/patients');
  await expect(page).toHaveURL(/\/auth\/sign-in/);

  await page.getByLabel('E-mail').fill('teste@medlife.test');
  await page.getByLabel('Senha').fill('naoimporta');
  await page.getByRole('button', { name: /entrar/i }).click();

  await expect(page).toHaveURL(/\/patients$/);
});

test('a signed-in user is kept off the sign-in page', async ({ page, supabase }) => {
  await supabase.signIn();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/auth/sign-in');
  await expect(page).toHaveURL(/\/$/);
});

test('reloading an authenticated page does not bounce to sign-in', async ({ page, supabase }) => {
  supabase.tables.patients = [];
  await supabase.signIn();
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();

  // `RequireAuth` has three states, not two. A guard that treats "still
  // restoring the session" as "signed out" works perfectly until someone
  // presses F5, which is the least acceptable moment for it to fail.
  await page.reload();

  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();
});

test('a secretary is not offered the doctor-only screens', async ({ page, supabase }) => {
  supabase.tables.doctor_secretaries = [
    { doctor_id: 'd-1', profiles: { id: 'd-1', role: 'doctor', full_name: 'Dr. Um' } },
  ];
  supabase.tables.patients = [];

  await supabase.signIn({ role: 'secretary' });

  const nav = await openNavigation(page);
  await expect(nav.getByRole('link', { name: 'Pacientes' })).toBeVisible();
  // Reports are financial end to end, and Secretárias is the doctor's own
  // admin screen. Hiding them is UX — RLS is what actually refuses the data —
  // but a secretary seeing a link that 404s her is still a bug.
  await expect(nav.getByRole('link', { name: 'Relatórios' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Secretárias' })).toHaveCount(0);
});

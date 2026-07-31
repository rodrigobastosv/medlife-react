import { expect, openNavigation, test } from './fixtures/supabase';

/**
 * The route error boundary (`app/routing/route-error-page.tsx`).
 *
 * A render error is the one failure this suite can provoke honestly rather than
 * simulate: `birth_date` is a Postgres `date`, `fromDateColumn` hands whatever
 * is in it to `parseISO`, and an unparseable string becomes an `Invalid Date`
 * that only explodes later — inside `formatDate`, during the render of the
 * patient's header. That is exactly the shape of the bug the boundary exists
 * for: not a failed request, which every screen already handles, but a value
 * that survives the mapper and kills the render.
 *
 * The assertion that matters is the one about the shell. Before the boundary the
 * page went blank; a boundary in the wrong place would replace the sidebar too,
 * which is a nicer-looking dead end but still a dead end.
 *
 * Sign-in and sign-up have a boundary of their own and no test here: those
 * screens read nothing from the database, so there is no response to malform and
 * no way to make them throw from the outside.
 */

const PATIENT_ID = 'p-1';

const patient = (birthDate: string | null) => ({
  id: PATIENT_ID,
  full_name: 'José Antônio da Silva',
  origin: 'networking',
  birth_date: birthDate,
  cpf: '12345678901',
  phone: '85999990000',
  address: null,
  invoice_name: null,
  invoice_cpf: null,
  notes: null,
  created_at: '2026-01-05T10:00:00Z',
});

/** What a `date` column can never hold, and what a mapper never checks for. */
const MALFORMED = 'sem data';

test('a row that breaks the render shows the fallback, not a blank page', async ({
  page,
  supabase,
}) => {
  supabase.tables.patients = [patient(MALFORMED)];
  supabase.tables.appointments = [];

  await supabase.signIn();
  await page.goto(`/patients/${PATIENT_ID}`);

  await expect(page.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();

  // The whole point of the bug report: the body used to be empty.
  await expect(page.locator('body')).not.toBeEmpty();
});

test('the navigation survives the error, so the user is not trapped', async ({
  page,
  supabase,
}) => {
  supabase.tables.patients = [patient(MALFORMED)];
  supabase.tables.appointments = [];

  await supabase.signIn();
  await page.goto(`/patients/${PATIENT_ID}`);
  await expect(page.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();

  // The boundary is declared *below* the shell precisely so this still works.
  const nav = await openNavigation(page);
  await nav.getByRole('link', { name: 'Agenda' }).click();

  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
});

test('"Tentar de novo" re-renders the screen once the data is sane', async ({ page, supabase }) => {
  supabase.tables.patients = [patient(MALFORMED)];
  supabase.tables.appointments = [];

  await supabase.signIn();
  await page.goto(`/patients/${PATIENT_ID}`);
  await expect(page.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();

  // Standing in for the fix landing on the server, or for the row simply having
  // been mangled by something transient. The retry has to drop the cached copy
  // to see it — re-rendering over the same cache would fail identically, which
  // is the failure mode that makes retry buttons untrustworthy.
  supabase.tables.patients = [patient('1980-03-04')];

  await page.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(page.getByRole('heading', { name: 'José Antônio da Silva' })).toBeVisible();
  await expect(page.getByText('04/03/1980')).toBeVisible();
});

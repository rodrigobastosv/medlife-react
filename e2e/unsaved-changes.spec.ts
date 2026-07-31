import { expect, openNavigation, test } from './fixtures/supabase';

/**
 * The guard over a half-filled form.
 *
 * This is a browser test and could not be anything else: what it checks is the
 * interaction between three things none of which exist outside one — React
 * Router's blocker, react-hook-form's `isDirty`, and a native `<dialog>`. The
 * failure it exists to catch is silent by definition. Nothing errors when a
 * click throws away ten minutes of typing; the screen simply changes.
 *
 * The third test is the one worth reading twice. Blocking navigation is easy;
 * remembering to stand down for the app's *own* redirect after a save is the
 * part that gets forgotten, and the bug it produces — being asked whether to
 * discard the changes you have just saved — is worse than the problem the guard
 * was added for, because it appears on the happy path every single time.
 */

const PATIENT = {
  id: 'p-1',
  full_name: 'José Antônio da Silva',
  origin: 'networking',
  birth_date: '1980-03-04',
  cpf: '12345678901',
  phone: '85999990000',
  address: null,
  invoice_name: null,
  invoice_cpf: null,
  notes: null,
  created_at: '2026-01-05T10:00:00Z',
};

const APPOINTMENT = {
  id: 'a-1',
  patient_id: 'p-1',
  scheduled_date: '2026-03-10',
  scheduled_time: '14:00:00',
  type: 'visit',
  location: 'office',
  status: 'completed',
  next_return_date: null,
  recall_date: null,
  notes: null,
  created_at: '2026-03-10T12:00:00Z',
  created_by: null,
  appointment_finances: null,
};

const DIALOG_TITLE = 'Alterações não salvas';

test.beforeEach(async ({ supabase }) => {
  supabase.tables.patients = [PATIENT];
  supabase.tables.appointments = [];
});

test('leaving a half-filled consultation asks first, and staying keeps what was typed', async ({
  page,
  supabase,
}) => {
  await supabase.signIn();
  await page.goto('/patients/p-1/appointments/new');

  const time = page.getByLabel('Horário');
  await time.fill('09:30');
  await page.getByLabel('Observações').fill('Paciente relatou dor no joelho esquerdo.');

  const nav = await openNavigation(page);
  await nav.getByRole('link', { name: 'Pacientes' }).click();

  await expect(page.getByText(DIALOG_TITLE)).toBeVisible();

  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(page.getByText(DIALOG_TITLE)).toBeHidden();

  // Still on the form, and — the part that makes the prompt worth anything —
  // with the notes intact. A guard that stops the navigation but remounts the
  // form has lost the data it just interrupted a user to protect.
  await expect(page).toHaveURL(/\/patients\/p-1\/appointments\/new$/);
  await expect(time).toHaveValue('09:30');
  await expect(page.getByLabel('Observações')).toHaveValue(
    'Paciente relatou dor no joelho esquerdo.',
  );
});

test('confirming the prompt goes where the click was headed', async ({ page, supabase }) => {
  await supabase.signIn();
  await page.goto('/patients/p-1/appointments/new');

  await page.getByLabel('Horário').fill('09:30');

  const nav = await openNavigation(page);
  await nav.getByRole('link', { name: 'Pacientes' }).click();
  await page.getByRole('button', { name: 'Sair sem salvar' }).click();

  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
  await expect(page.getByText(DIALOG_TITLE)).toHaveCount(0);
});

test('a successful save redirects without asking anything', async ({ page, supabase }) => {
  await supabase.signIn();
  await page.goto('/patients/p-1/appointments/new');

  await page.getByLabel('Horário').fill('09:30');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  // The form is still dirty at this point — react-hook-form has no idea the
  // values reached a database — so the guard has to have been told to stand
  // down. If it was not, this lands on the dialog instead of on the patient.
  await expect(page).toHaveURL(/\/patients\/p-1$/);
  await expect(page.getByText(DIALOG_TITLE)).toHaveCount(0);
  expect(supabase.writes.some((write) => write.table === 'appointments')).toBe(true);
});

test('the browser Back button is stopped too', async ({ page, supabase }) => {
  await supabase.signIn();
  await page.goto('/patients/p-1');
  // Reached by a click rather than by `goto`, so the history entry is one React
  // Router owns. Back out of a document the app did not push and there is no
  // blocker to consult — only `beforeunload`, which is the other half of the
  // guard and cannot be asserted on from here.
  await page.getByRole('link', { name: 'Nova consulta' }).first().click();

  await page.getByLabel('Horário').fill('09:30');
  await page.goBack();

  await expect(page.getByText(DIALOG_TITLE)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(page).toHaveURL(/\/patients\/p-1\/appointments\/new$/);
  await expect(page.getByLabel('Horário')).toHaveValue('09:30');
});

test('an edit screen opened and not touched lets you leave in silence', async ({
  page,
  supabase,
}) => {
  supabase.tables.appointments = [APPOINTMENT];

  await supabase.signIn();
  await page.goto('/patients/p-1/appointments/a-1/edit');
  await expect(page.getByLabel('Horário')).toHaveValue('14:00');

  const nav = await openNavigation(page);
  await nav.getByRole('link', { name: 'Pacientes' }).click();

  // The whole reason the condition is `isDirty` and not "has a value": this form
  // opened populated. Prompting here would train people to dismiss the dialog
  // without reading it, and then the one that mattered gets dismissed too.
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByText(DIALOG_TITLE)).toHaveCount(0);
});

test('the patient form is guarded the same way, including its own Voltar link', async ({
  page,
  supabase,
}) => {
  await supabase.signIn();
  await page.goto('/patients/new');

  await page.getByLabel('Nome completo').fill('Marina Albuquerque');

  // The link in the page header, not the sidebar — it is a `<Link>` like any
  // other, and being the closest way out of the form makes it the likeliest way
  // to lose one.
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page.getByText(DIALOG_TITLE)).toBeVisible();

  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(page.getByText(DIALOG_TITLE)).toBeHidden();
  await expect(page).toHaveURL(/\/patients\/new$/);
  await expect(page.getByLabel('Nome completo')).toHaveValue('Marina Albuquerque');

  // And saving it leaves without a word, as on the consultation form. `exact`
  // because "Salvar" is a substring of the dialog's own "Sair sem salvar".
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/patients\/stub-patients-id$/);
  await expect(page.getByText(DIALOG_TITLE)).toHaveCount(0);
});

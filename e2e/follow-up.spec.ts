import { expect, test } from './fixtures/supabase';

/**
 * Acompanhamento — the doctor's own contact list.
 *
 * The thing worth testing is not that a date field saves a date. It is that an
 * acompanhamento and a recall stayed *different*, because they look alike from
 * every angle except the one that matters: a recall is the secretary calling to
 * book the next consultation, an acompanhamento is the doctor calling to ask how
 * someone is. The failure mode of building the second on top of the first is
 * that a secretary is shown a queue she cannot clear, and the way that bug
 * arrives is silent — one extra section on a screen nobody re-reads.
 *
 * So the role split is asserted from both sides, with the same data.
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

/** Dated in the past so it is already in the backlog whenever this runs. */
const WITH_FOLLOW_UP = {
  id: 'a-1',
  patient_id: 'p-1',
  scheduled_date: '2026-03-10',
  scheduled_time: '14:00:00',
  type: 'visit',
  location: 'office',
  status: 'completed',
  next_return_date: null,
  recall_date: null,
  follow_up_date: '2026-03-17',
  follow_up_time: '16:30:00',
  notes: null,
  created_at: '2026-03-10T12:00:00Z',
  created_by: null,
  appointment_finances: null,
  patients: { full_name: PATIENT.full_name, phone: PATIENT.phone },
};

test.beforeEach(async ({ supabase }) => {
  supabase.tables.patients = [PATIENT];
  supabase.tables.appointments = [WITH_FOLLOW_UP];
});

test('a doctor gets an acompanhamento queue of their own on Início', async ({ page, supabase }) => {
  await supabase.signIn({ role: 'doctor' });

  await expect(page.getByRole('heading', { name: 'Acompanhamentos pendentes' })).toBeVisible();
  // The summary card too — it is the count the doctor scans before reading.
  await expect(page.getByText('Acompanhamentos', { exact: true })).toBeVisible();
});

test('a secretary is shown neither the acompanhamento card nor its section', async ({
  page,
  supabase,
}) => {
  // A secretary with no active link has no doctor to work on and never reaches
  // Início at all, so without this the test would pass against the wrong screen.
  supabase.tables.doctor_secretaries = [
    { doctor_id: 'd-1', profiles: { id: 'd-1', role: 'doctor', full_name: 'Dr. Um' } },
  ];
  await supabase.signIn({ role: 'secretary' });

  // Recalls are hers, so the screen has definitely rendered — without this the
  // assertions below would pass on a page that simply had not loaded.
  await expect(page.getByRole('heading', { name: 'Recalls pendentes' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Acompanhamentos pendentes' })).toHaveCount(0);
  await expect(page.getByText('Acompanhamentos', { exact: true })).toHaveCount(0);
});

test('the form saves the acompanhamento as its own pair of columns', async ({ page, supabase }) => {
  supabase.tables.appointments = [];
  await supabase.signIn();
  await page.goto('/patients/p-1/appointments/new');

  await page.getByLabel('Horário').fill('09:30');
  await page.getByLabel('Acompanhamento', { exact: true }).fill('2026-09-15');
  await page.getByLabel('Hora do acompanhamento').fill('11:45');
  // Filled as well, and deliberately: the point is that the two land in
  // different columns rather than overwriting one another.
  await page.getByLabel('Recall').fill('2026-09-20');

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/patients\/p-1$/);

  const write = supabase.writes.find((entry) => entry.table === 'appointments');
  expect(write?.body).toMatchObject({
    follow_up_date: '2026-09-15',
    follow_up_time: '11:45',
    recall_date: '2026-09-20',
  });
});

test('an acompanhamento with no hour is saved as a day alone', async ({ page, supabase }) => {
  supabase.tables.appointments = [];
  await supabase.signIn();
  await page.goto('/patients/p-1/appointments/new');

  await page.getByLabel('Horário').fill('09:30');
  await page.getByLabel('Acompanhamento', { exact: true }).fill('2026-09-15');

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/patients\/p-1$/);

  const write = supabase.writes.find((entry) => entry.table === 'appointments');
  // Null rather than '00:00': the form leaves the hour optional, and inventing
  // midnight would make the notification fire at the wrong end of the day.
  expect(write?.body).toMatchObject({ follow_up_date: '2026-09-15', follow_up_time: null });
});

test('an hour typed without a day is discarded rather than stored alone', async ({
  page,
  supabase,
}) => {
  supabase.tables.appointments = [];
  await supabase.signIn();
  await page.goto('/patients/p-1/appointments/new');

  await page.getByLabel('Horário').fill('09:30');
  await page.getByLabel('Hora do acompanhamento').fill('11:45');

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/patients\/p-1$/);

  const write = supabase.writes.find((entry) => entry.table === 'appointments');
  // An hour with no day is not a moment. Keeping it would resurrect itself the
  // next time somebody set a date on this appointment.
  expect(write?.body).toMatchObject({ follow_up_date: null, follow_up_time: null });
});

test('the tile tells an acompanhamento apart from a recall at a glance', async ({
  page,
  supabase,
}) => {
  supabase.tables.appointments = [{ ...WITH_FOLLOW_UP, recall_date: '2026-03-20' }];
  await supabase.signIn();
  await page.goto('/patients/p-1');

  await expect(page.getByText('Acompanhamento em 17/03/2026 às 16:30')).toBeVisible();
  await expect(page.getByText('Recall em 20/03/2026')).toBeVisible();
});

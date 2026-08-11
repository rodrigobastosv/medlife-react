import { expect, test } from './fixtures/supabase';

/**
 * The warning that says somebody is already in that slot.
 *
 * A browser test because the interesting part is not the rule — that is
 * `conflictsAt`, pure and checked on its own — but the wiring around it: three
 * queries whose answers have to arrive before the message can be trusted, and a
 * message that must *not* behave like a validation error. The failure this
 * guards against is the one where the warning quietly stops appearing, which
 * looks exactly like a day with nothing booked on it.
 *
 * The last test is the one worth reading twice. An *encaixe* is a real thing a
 * practice does, so the form has to keep saving over a conflict. A version of
 * this feature that blocked the save would pass every other test here and be
 * worse than not having it, because people would work around it by recording
 * the wrong time.
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

/** 2026-03-10 is a Tuesday — `weekday: 2` in the rule below. */
const DAY = '2026-03-10';

const EXISTING = {
  id: 'a-1',
  patient_id: 'p-2',
  scheduled_date: DAY,
  scheduled_time: '09:00:00',
  type: 'visit',
  location: 'oncovie',
  status: 'scheduled',
  next_return_date: null,
  recall_date: null,
  notes: null,
  created_at: '2026-03-01T12:00:00Z',
  created_by: null,
  appointment_finances: null,
  patients: { full_name: 'Maria Souza', phone: null },
};

const CLINIC_HOURS = {
  id: 'r-1',
  location: 'oncovie',
  weekday: 2,
  start_time: '08:00:00',
  end_time: '12:00:00',
  slot_duration_minutes: 30,
};

test.beforeEach(async ({ supabase }) => {
  supabase.tables.patients = [PATIENT];
  supabase.tables.appointments = [EXISTING];
  supabase.tables.availability_exceptions = [];
});

/** Opens the form on `DAY`, at the clinic, with `time` typed in. */
async function fillSlot(page: import('@playwright/test').Page, time: string) {
  await page.goto(`/patients/p-1/appointments/new?on=${DAY}`);
  await page.getByLabel('Local').selectOption('oncovie');
  await page.getByLabel('Horário').fill(time);
}

test('booking into a taken time says who is already there', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [CLINIC_HOURS];
  await supabase.signIn();

  await fillSlot(page, '09:00');

  await expect(page.getByText(/Já existe consulta às 09:00 com Maria Souza/)).toBeVisible();
});

test('a free time says nothing at all', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [CLINIC_HOURS];
  await supabase.signIn();

  await fillSlot(page, '11:00');

  await expect(page.getByText(/Já existe consulta/)).toBeHidden();
});

test('declared hours make an overlapping time a conflict, not just an identical one', async ({
  page,
  supabase,
}) => {
  supabase.tables.availability_rules = [CLINIC_HOURS];
  await supabase.signIn();

  // 09:15 is nobody's start time. It collides only because the 09:00 runs for
  // the thirty minutes the doctor declared — which is the whole reason the
  // availability model had to exist before this warning could.
  await fillSlot(page, '09:15');

  await expect(page.getByText(/Já existe consulta às 09:00 com Maria Souza/)).toBeVisible();
});

test('with no declared hours, only the exact same time is reported', async ({ page, supabase }) => {
  // Nothing forces the doctor to fill in her week, and the form still has to
  // behave. Without a duration the app cannot know a 09:00 reaches 09:15, and
  // inventing one would either invent conflicts or hide real ones.
  supabase.tables.availability_rules = [];
  await supabase.signIn();

  await fillSlot(page, '09:15');
  await expect(page.getByText(/Já existe consulta/)).toBeHidden();

  await page.getByLabel('Horário').fill('09:00');
  await expect(page.getByText(/Já existe consulta às 09:00 com Maria Souza/)).toBeVisible();
});

test('a cancelled consultation gave its slot back', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [CLINIC_HOURS];
  supabase.tables.appointments = [{ ...EXISTING, status: 'cancelled' }];
  await supabase.signIn();

  await fillSlot(page, '09:00');

  await expect(page.getByText(/Já existe consulta/)).toBeHidden();
});

test('editing a consultation does not report it as colliding with itself', async ({
  page,
  supabase,
}) => {
  supabase.tables.availability_rules = [CLINIC_HOURS];
  // The same appointment, now belonging to the patient whose record is open —
  // the form loads it from the patient's history to edit it.
  supabase.tables.appointments = [{ ...EXISTING, patient_id: 'p-1' }];
  await supabase.signIn();

  await page.goto('/patients/p-1/appointments/a-1/edit');

  await expect(page.getByLabel('Horário')).toHaveValue('09:00');
  await expect(page.getByText(/Já existe consulta/)).toBeHidden();
});

test('the warning does not block the save — an encaixe is allowed', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [CLINIC_HOURS];
  await supabase.signIn();

  await fillSlot(page, '09:00');
  await expect(page.getByText(/Já existe consulta às 09:00/)).toBeVisible();

  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page).toHaveURL(/\/patients\/p-1$/);
  expect(
    supabase.writes.some(
      (write) => write.table === 'appointments' && write.method !== 'GET' && write.body !== null,
    ),
  ).toBe(true);
});

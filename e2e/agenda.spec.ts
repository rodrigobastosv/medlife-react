import { expect, test, type Page } from './fixtures/supabase';

/**
 * The agenda's day list, and what is allowed to appear on it.
 *
 * Worth a browser test rather than a unit one because the interesting part is
 * the *merge*: the day now draws from two independent queries — the appointments
 * of the month and the patient register — and the failure modes live in the seam
 * between them. An empty state shown before the register arrives, a birthday
 * that never renders because the day list assumed every event carries an
 * appointment, an acompanhamento left out of the query's date filter: none of
 * those are visible from either expansion function on its own.
 *
 * Dates are built from the clock, because the calendar opens on the current
 * month with today selected. Hard-coding one would make the whole file pass or
 * fail depending on the day it is run.
 */

const iso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const TODAY = iso(new Date());
/** The same day and month as today, a lifetime earlier — a birthday falling today. */
const BORN_TODAY = `1980-${TODAY.slice(5)}`;

const PATIENT = {
  id: 'p-1',
  full_name: 'Ana Souza',
  origin: 'networking',
  birth_date: BORN_TODAY,
  cpf: null,
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
  scheduled_date: TODAY,
  scheduled_time: '14:00:00',
  type: 'visit',
  location: 'office',
  status: 'scheduled',
  next_return_date: null,
  recall_date: null,
  // The consultation is today and so is the acompanhamento it left behind, so
  // the same row has to land on the day twice, under two different labels.
  follow_up_date: TODAY,
  follow_up_time: '16:30:00',
  notes: null,
  created_at: '2026-01-05T12:00:00Z',
  created_by: null,
  appointment_finances: null,
  patients: { full_name: PATIENT.full_name, phone: PATIENT.phone },
};

/**
 * The rows of the strip above the axis — everything on the day with no time.
 *
 * Named rather than reached for by position, and for two reasons that both bite.
 * The legend under the calendar prints every event type on every visit, so an
 * unscoped `getByText('Aniversário')` passes against a page where the feature
 * does not work at all; and the patient picker keeps a second list of names in
 * the DOM while it is closed, so "the list items in main" is not the day either.
 */
const untimedRows = (page: Page) =>
  page.getByRole('list', { name: 'Sem horário definido' }).getByRole('listitem');

/**
 * The label above each row — "Consulta", "Acompanhamento", "Aniversário".
 *
 * Read from the tag element rather than by filtering rows on their text, because
 * the tile inside a row repeats those words for other reasons: an appointment
 * whose type is a consultation says "Consulta" in its body, and one carrying an
 * acompanhamento prints "Acompanhamento em 02/08/2026" as a tag of its own. Only
 * the position says which of them is the reason this row is on this day.
 */
const untimedTags = (page: Page) =>
  page.getByRole('list', { name: 'Sem horário definido' }).locator('li > span');

/** The blocks drawn on the day's time axis. */
const timelineBlocks = (page: Page) =>
  page.getByRole('list', { name: 'Consultas do dia' }).getByRole('listitem');

test('one appointment lands on the day twice when it carries an acompanhamento', async ({
  page,
  supabase,
}) => {
  supabase.tables.patients = [{ ...PATIENT, birth_date: null }];
  supabase.tables.appointments = [APPOINTMENT];

  await supabase.signIn();
  await page.goto('/agenda');

  // Two blocks for one appointment: the same row is on the day for two
  // different reasons, which is the fan-out the calendar exists to show. Both
  // land on the axis because both carry an hour — the consultation at 14:00 and
  // the acompanhamento the doctor set for 16:30.
  await expect(timelineBlocks(page)).toHaveCount(2);
  await expect(timelineBlocks(page).nth(0)).toContainText('14:00');
  await expect(timelineBlocks(page).nth(1)).toContainText('16:30');
  await expect(untimedRows(page)).toHaveCount(0);
});

test('an acompanhamento with no hour is a task, not a slot at midnight', async ({
  page,
  supabase,
}) => {
  supabase.tables.patients = [{ ...PATIENT, birth_date: null }];
  supabase.tables.appointments = [{ ...APPOINTMENT, follow_up_time: null }];

  await supabase.signIn();
  await page.goto('/agenda');

  // The consultation keeps its 14:00 on the axis; the acompanhamento has only a
  // day, so it belongs in the strip above it. Drawing it at the top of a clock
  // would claim somebody scheduled it for midnight.
  await expect(timelineBlocks(page)).toHaveCount(1);
  await expect(untimedTags(page)).toHaveText(['Acompanhamento']);
});

test('a birthday appears on a day with nothing scheduled', async ({ page, supabase }) => {
  supabase.tables.patients = [PATIENT];
  supabase.tables.appointments = [];

  await supabase.signIn();
  await page.goto('/agenda');

  await expect(untimedTags(page)).toHaveText(['Aniversário']);

  const birthday = untimedRows(page).first();
  await expect(birthday.getByText('Ana Souza')).toBeVisible();
  // Not "hoje": the calendar can be showing any day, and the age is the only
  // part of the sentence that is true on all of them.
  await expect(birthday.getByText(/Faz \d+ anos/)).toBeVisible();
  // A birthday is a fact about a date and never reaches the axis, however empty
  // the day is.
  await expect(timelineBlocks(page)).toHaveCount(0);
});

test('a patient with no birth date is not treated as born on the 1st', async ({
  page,
  supabase,
}) => {
  supabase.tables.patients = [{ ...PATIENT, birth_date: null }];
  supabase.tables.appointments = [];

  await supabase.signIn();
  await page.goto('/agenda');

  // An empty day is not an empty screen any more — it is an axis with nothing
  // on it, which is the point: a day with no bookings is exactly the day whose
  // gaps you came to look at. What must not appear is a phantom birthday.
  await expect(untimedRows(page)).toHaveCount(0);
  await expect(timelineBlocks(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar consulta às 09:00' })).toBeVisible();
});

test('the legend explains every colour the calendar can show', async ({ page, supabase }) => {
  supabase.tables.patients = [PATIENT];
  supabase.tables.appointments = [APPOINTMENT];

  await supabase.signIn();
  await page.goto('/agenda');

  // The legend is built from `AGENDA_EVENT_TYPES` rather than from a list
  // repeated in the page, so this is what catches a sixth type arriving on the
  // calendar as an unexplained dot.
  for (const label of ['Consulta', 'Retorno', 'Recall', 'Acompanhamento', 'Aniversário']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

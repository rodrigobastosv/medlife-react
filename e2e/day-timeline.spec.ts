import { expect, test, type Page } from './fixtures/supabase';

/**
 * The day drawn on a clock.
 *
 * A browser test because the whole feature is geometry and wiring: an axis whose
 * bounds come from one query, block heights that come from another, and a click
 * on empty space that has to travel through a dialog into a form's default
 * values. None of that is visible from `buildDayTimeline`, which is checked on
 * its own and knows nothing about any of it.
 *
 * Dates come from the clock, because the agenda opens on today. Hard-coding one
 * would make the file pass or fail depending on the day it runs — and the
 * weekday matters here, since a weekly rule is keyed by it.
 */

const iso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const TODAY = new Date();
const TODAY_ISO = iso(TODAY);
const TODAY_WEEKDAY = TODAY.getDay();

const PATIENT = {
  id: 'p-1',
  full_name: 'Ana Souza',
  origin: 'networking',
  birth_date: null,
  cpf: null,
  phone: '85999990000',
  address: null,
  invoice_name: null,
  invoice_cpf: null,
  notes: null,
  created_at: '2026-01-05T10:00:00Z',
};

/** Clinic mornings only — the axis should end at midday, not at six. */
const MORNINGS = {
  id: 'r-1',
  location: 'oncovie',
  weekday: TODAY_WEEKDAY,
  start_time: '08:00:00',
  end_time: '12:00:00',
  slot_duration_minutes: 30,
};

/** Home visits run 90 minutes, because they include getting there. */
const HOME_AFTERNOONS = {
  id: 'r-2',
  location: 'home',
  weekday: TODAY_WEEKDAY,
  start_time: '14:00:00',
  end_time: '18:00:00',
  slot_duration_minutes: 90,
};

const appointment = (over: Record<string, unknown>) => ({
  id: 'a-1',
  patient_id: 'p-1',
  scheduled_date: TODAY_ISO,
  scheduled_time: '09:00:00',
  type: 'visit',
  location: 'oncovie',
  status: 'scheduled',
  next_return_date: null,
  recall_date: null,
  follow_up_date: null,
  follow_up_time: null,
  notes: null,
  created_at: '2026-01-05T12:00:00Z',
  created_by: null,
  appointment_finances: null,
  patients: { full_name: PATIENT.full_name, phone: PATIENT.phone },
  ...over,
});

const slot = (page: Page, time: string) =>
  page.getByRole('button', { name: `Marcar consulta às ${time}` });

const blocks = (page: Page) =>
  page.getByRole('list', { name: 'Consultas do dia' }).getByRole('listitem');

test.beforeEach(async ({ supabase }) => {
  supabase.tables.patients = [PATIENT];
  supabase.tables.appointments = [];
  supabase.tables.availability_exceptions = [];
});

test('the declared hours are the axis', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [MORNINGS];
  await supabase.signIn();
  await page.goto('/agenda');

  await expect(slot(page, '08:00')).toBeVisible();
  await expect(slot(page, '11:00')).toBeVisible();
  // Nothing is declared after midday, so there is no afternoon to click into.
  await expect(slot(page, '14:00')).toHaveCount(0);
});

test('a morning at the clinic and an afternoon at home are one day', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [MORNINGS, HOME_AFTERNOONS];
  await supabase.signIn();
  await page.goto('/agenda');

  await expect(slot(page, '08:00')).toBeVisible();
  await expect(slot(page, '17:00')).toBeVisible();
  // The gap between them is the whole argument for an axis over a list: 12:00
  // and 13:00 are drawn, empty, and bookable.
  await expect(slot(page, '12:00')).toBeVisible();
  await expect(slot(page, '13:00')).toBeVisible();
});

test('an undeclared day says so instead of inventing hours quietly', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [];
  await supabase.signIn();
  await page.goto('/agenda');

  await expect(page.getByText(/Horário de atendimento não declarado/)).toBeVisible();
  // A usable fallback day is still drawn — the notice explains it rather than
  // replacing it.
  await expect(slot(page, '09:00')).toBeVisible();
});

test('a home visit is drawn three times taller than a clinic appointment', async ({
  page,
  supabase,
}) => {
  supabase.tables.availability_rules = [MORNINGS, HOME_AFTERNOONS];
  supabase.tables.appointments = [
    appointment({ id: 'a-1', scheduled_time: '09:00:00', location: 'oncovie' }),
    appointment({ id: 'a-2', scheduled_time: '14:00:00', location: 'home' }),
  ];
  await supabase.signIn();
  await page.goto('/agenda');

  await expect(blocks(page)).toHaveCount(2);
  const clinic = await blocks(page).nth(0).boundingBox();
  const home = await blocks(page).nth(1).boundingBox();

  // 30 minutes against 90. The exact pixels are the component's business; the
  // ratio is the claim — that a block's height comes from its own location's
  // declared duration, which is the reason availability is per location at all.
  expect(clinic).not.toBeNull();
  expect(home).not.toBeNull();
  expect(home!.height).toBeCloseTo(clinic!.height * 3, 0);
});

test('two patients in one slot are drawn side by side, not on top of each other', async ({
  page,
  supabase,
}) => {
  supabase.tables.availability_rules = [MORNINGS];
  supabase.tables.appointments = [
    appointment({ id: 'a-1', scheduled_time: '09:00:00' }),
    appointment({ id: 'a-2', scheduled_time: '09:00:00' }),
  ];
  await supabase.signIn();
  await page.goto('/agenda');

  await expect(blocks(page)).toHaveCount(2);
  const first = await blocks(page).nth(0).boundingBox();
  const second = await blocks(page).nth(1).boundingBox();

  // The form warns about an encaixe and then allows it, so the axis has to be
  // able to draw one. Stacked blocks would hide exactly the situation this
  // screen exists to make visible.
  expect(first!.y).toBeCloseTo(second!.y, 0);
  expect(second!.x).toBeGreaterThan(first!.x + first!.width - 1);
});

test('an appointment before opening time still stretches the axis to reach it', async ({
  page,
  supabase,
}) => {
  supabase.tables.availability_rules = [MORNINGS];
  supabase.tables.appointments = [appointment({ scheduled_time: '07:00:00' })];
  await supabase.signIn();
  await page.goto('/agenda');

  // The clinic opens at 08:00 and somebody was squeezed in at 07:00. An axis
  // that started at its declared hour would position that block above its own
  // top edge, which is the one place nobody will look for it.
  await expect(slot(page, '07:00')).toBeVisible();
  await expect(blocks(page)).toHaveCount(1);
});

test('clicking an empty hour books into it', async ({ page, supabase }) => {
  supabase.tables.availability_rules = [MORNINGS];
  await supabase.signIn();
  await page.goto('/agenda');

  await slot(page, '10:00').click();

  // The dialog only answers "who?" — it says which slot it is answering it for.
  await expect(page.getByText(/Para quem é a consulta de .* às 10:00\?/)).toBeVisible();
  await page.getByRole('button', { name: /Ana Souza/ }).click();

  await expect(page).toHaveURL(new RegExp(`on=${TODAY_ISO}&at=10:00`));
  // The form otherwise refuses to guess a time. Clicking 10:00 on the axis is
  // not a guess — it is the user naming it — which is the whole distinction
  // this pre-fill rests on.
  await expect(page.getByLabel('Horário')).toHaveValue('10:00');
});

import { denyNotifications, expect, test, TEST_USER_ID } from './fixtures/supabase';

/**
 * The notification settings card.
 *
 * Worth testing in a browser rather than as a unit, because most of what can go
 * wrong here is browser state the component only observes: whether push is
 * supported, whether permission was granted, whether this browser holds a
 * subscription. Those are three separate facts and the card renders a different
 * sentence for each — getting them confused sends someone into their browser
 * settings looking for a switch that was never the problem.
 */

const preferences = (over: Record<string, unknown> = {}) => ({
  user_id: TEST_USER_ID,
  daily_agenda_enabled: false,
  daily_agenda_time: '07:30:00',
  recalls_enabled: false,
  recalls_time: '09:00:00',
  new_appointment_enabled: false,
  upcoming_visit_enabled: false,
  upcoming_lead_minutes: 30,
  push_enabled: false,
  timezone: 'America/Sao_Paulo',
  ...over,
});

test.beforeEach(async ({ supabase }) => {
  supabase.tables.notification_preferences = [preferences()];
});

test('a doctor is offered all four kinds', async ({ page, supabase }) => {
  await supabase.signIn({ role: 'doctor' });
  await page.goto('/settings');

  await expect(page.getByRole('switch', { name: /Consultas do dia/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Pacientes para ligar/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Nova consulta marcada/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Lembrete antes da consulta/ })).toBeVisible();
});

test('a secretary is not offered "nova consulta marcada"', async ({ page, supabase }) => {
  supabase.tables.doctor_secretaries = [
    { doctor_id: 'd-1', profiles: { id: 'd-1', role: 'doctor', full_name: 'Dr. Um' } },
  ];
  await supabase.signIn({ role: 'secretary' });
  await page.goto('/settings');

  await expect(page.getByRole('switch', { name: /Consultas do dia/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Pacientes para ligar/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Lembrete antes da consulta/ })).toBeVisible();
  // She is usually the somebody-else who booked it; telling her would be the
  // app reporting her own action back to her. Enforced in the planner too.
  await expect(page.getByRole('switch', { name: /Nova consulta marcada/ })).toHaveCount(0);
});

test('turning a switch on saves it and reveals its setting', async ({ page, supabase }) => {
  await supabase.signIn();
  await page.goto('/settings');

  const daily = page.getByRole('switch', { name: /Consultas do dia/ });
  await expect(daily).toHaveAttribute('aria-checked', 'false');

  await daily.click();

  // Optimistic: the switch moves before the round trip, because a toggle that
  // waits reads as broken and gets clicked again.
  await expect(daily).toHaveAttribute('aria-checked', 'true');

  // The time field appears only once the switch is on — there is nothing to
  // configure about a notification that is not being sent.
  await expect(page.getByLabel('Horário do aviso')).toBeVisible();

  await expect
    .poll(() => supabase.writes.filter((w) => w.table === 'notification_preferences').length)
    .toBeGreaterThan(0);

  const write = supabase.writes.find((w) => w.table === 'notification_preferences');
  expect(write?.body).toMatchObject({ daily_agenda_enabled: true });
});

test('the lead time is a closed list, matching the database check constraint', async ({
  page,
  supabase,
}) => {
  supabase.tables.notification_preferences = [preferences({ upcoming_visit_enabled: true })];
  await supabase.signIn();
  await page.goto('/settings');

  // The column has `check (upcoming_lead_minutes in (15, 30, 60))`. A value the
  // form can offer but the database rejects would be a save that fails with a
  // constraint error nobody can act on, so the two lists have to agree.
  const select = page.getByLabel('Quando avisar');
  // Waited for explicitly: `allTextContents()` is one of the few Playwright
  // calls with no auto-waiting, so reading it straight after `goto` samples an
  // empty page and passes or fails on timing rather than on content.
  await expect(select).toBeVisible();

  expect(await select.locator('option').allTextContents()).toEqual([
    '15 minutos antes',
    '30 minutos antes',
    '1 hora antes',
  ]);
});

test('a blocked permission explains itself and offers no dead button', async ({
  page,
  supabase,
}) => {
  await denyNotifications(page);
  await supabase.signIn();
  await page.goto('/settings');

  await expect(page.getByText(/As notificações estão bloqueadas/)).toBeVisible();

  // The rule: `denied` cannot be re-requested from JavaScript at all. An enable
  // button here would do nothing, every time it was pressed, with no feedback —
  // the worst possible control. The switches stay, because preferences belong to
  // the account and are still worth setting from a browser that cannot receive.
  await expect(page.getByRole('button', { name: /Ativar neste aparelho/ })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: /Consultas do dia/ })).toBeVisible();
});

test('with permission granted, the device is offered the enable button', async ({
  page,
  context,
  supabase,
}) => {
  await context.grantPermissions(['notifications']);

  await supabase.signIn();
  await page.goto('/settings');

  await expect(page.getByRole('button', { name: /Ativar neste aparelho/ })).toBeVisible();
  await expect(page.getByText(/As notificações estão bloqueadas/)).toHaveCount(0);
});

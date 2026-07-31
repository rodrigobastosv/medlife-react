import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/supabase';

/**
 * The duplicate-CPF check on the patient form.
 *
 * The same person registered twice splits their history in half without
 * anything erroring, so there are two defences and they are different in kind:
 * the partial unique index in
 * `supabase/migrations/007_patients_unique_cpf.sql` makes a duplicate
 * impossible, and this check makes it *unnecessary* — it finds the existing
 * record while the CPF is still being typed and offers to open it.
 *
 * What is worth a browser here is the wiring, which is all timing: the lookup
 * hangs off a blur, its answer arrives asynchronously, and the record it finds
 * may be the very one being edited. The last test covers the case the form
 * cannot win — the database refusing the write — because between the lookup and
 * the insert another device can have taken the CPF.
 */

const existing = {
  id: 'p-1',
  full_name: 'Maria Silva',
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

/** The CPF field, told apart from "CPF na nota" — `getByLabel` is a substring match. */
const cpfField = (page: Page) => page.getByLabel('CPF', { exact: true });

const notice = (page: Page) => page.getByText(/Já existe um paciente com esse CPF/);

/** The request the blur fires, identified by the CPF filter it carries. */
const lookupRequest = (page: Page) =>
  page.waitForRequest(
    (request) => request.url().includes('/rest/v1/patients') && request.url().includes('cpf=in.'),
  );

test('a CPF already in the register offers the existing patient', async ({ page, supabase }) => {
  supabase.tables.patients = [existing];

  await supabase.signIn();
  await page.goto('/patients/new');

  const lookup = lookupRequest(page);
  await cpfField(page).fill('12345678901');
  // Tab, not a synthetic blur: leaving the field is the real gesture, and it is
  // what react-hook-form's own `onBlur` is attached to as well.
  await page.keyboard.press('Tab');

  // Both spellings are asked for in one query, because the column holds the CPF
  // as it was typed — in this app or in the Flutter one — and the same person
  // masked is still the same person.
  const asked = decodeURIComponent((await lookup).url());
  expect(asked).toContain('12345678901');
  expect(asked).toContain('123.456.789-01');

  await expect(notice(page)).toContainText('Maria Silva');

  // The way out of the situation, which is the whole point: the record is
  // offered rather than the save refused.
  //
  // In a new tab, and this test is the reason that is not a detail. The notice
  // cannot appear until a CPF has been typed, so the form behind it is always
  // dirty — and a same-tab link therefore always lands on the unsaved-changes
  // dialog, asking whether to throw away the form as the price of looking at
  // the record the app itself just suggested.
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Abrir cadastro' }).click();

  const record = await opened;
  await expect(record).toHaveURL(/\/patients\/p-1$/);
  await expect(record.getByRole('heading', { name: 'Maria Silva' })).toBeVisible();

  // And the form is untouched: nothing was discarded, nothing was asked.
  // `toBeHidden`, not `toHaveCount(0)` — the guard's `<dialog>` is in the DOM of
  // every form whether or not it is open, and this test stays on the page rather
  // than leaving it.
  await expect(page.getByText('Alterações não salvas')).toBeHidden();
  await expect(cpfField(page)).toHaveValue('12345678901');
});

test('a CPF nobody holds is not accused', async ({ page, supabase }) => {
  supabase.tables.patients = [existing];

  await supabase.signIn();
  await page.goto('/patients/new');

  await cpfField(page).fill('12345678901');
  await page.keyboard.press('Tab');
  await expect(notice(page)).toBeVisible();

  // Correcting the CPF has to withdraw the accusation. Asserting only that a
  // fresh form says nothing would pass just as well against a check that never
  // ran at all; this way the notice is known to have been there first.
  supabase.tables.patients = [];
  const lookup = lookupRequest(page);
  await cpfField(page).fill('98765432100');
  await page.keyboard.press('Tab');
  await lookup;

  await expect(notice(page)).toHaveCount(0);
});

test('editing a patient does not accuse them of being themselves', async ({ page, supabase }) => {
  supabase.tables.patients = [existing];

  await supabase.signIn();
  await page.goto('/patients/p-1/edit');

  // The CPF is already in the field, so leaving it looks the patient up and
  // finds… the patient. A check that compared nothing but the CPF would make
  // this field unusable on every edit.
  const lookup = lookupRequest(page);
  await cpfField(page).click();
  await page.keyboard.press('Tab');
  await lookup;

  await expect(notice(page)).toHaveCount(0);
});

test('a duplicate the database catches is reported in Portuguese', async ({ page, supabase }) => {
  // Nothing for the form's own check to find: this is the race it cannot win,
  // where the CPF is taken between the lookup and the insert.
  supabase.tables.patients = [];

  // Registered after the fixture's handler, so it is matched first; everything
  // that is not the insert falls through to the stub.
  await page.route('**/rest/v1/patients*', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        code: '23505',
        details: 'Key (owner_id, cpf)=(…, 12345678901) already exists.',
        hint: null,
        message: 'duplicate key value violates unique constraint "patients_owner_cpf_key"',
      }),
    });
  });

  await supabase.signIn();
  await page.goto('/patients/new');

  await page.getByLabel('Nome completo').fill('Maria Silva');
  await cpfField(page).fill('12345678901');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText('Já existe um paciente com esse CPF neste cadastro')).toBeVisible();
  // The constraint's own words are a sentence about the database, not about the
  // person at the desk — and they name a column and an index nobody there can
  // act on.
  await expect(page.getByText(/duplicate key value/)).toHaveCount(0);
});

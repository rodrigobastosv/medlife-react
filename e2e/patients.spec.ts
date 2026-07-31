import { expect, test } from './fixtures/supabase';

/**
 * The patient list and its search.
 *
 * `searchPatients` is a pure function and could be checked far more cheaply than
 * with a browser. What is tested here is the part that is not pure: that the
 * field is wired to the filter at all, that `useDeferredValue` does not leave
 * the list showing yesterday's term, and that an empty result says the right
 * thing — none of which a unit test of the matcher would notice.
 */

const patient = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

test.beforeEach(async ({ supabase }) => {
  supabase.tables.patients = [
    patient(),
    patient({
      id: 'p-2',
      full_name: 'Marina Albuquerque',
      cpf: '98765432100',
      phone: '8533334444',
    }),
    patient({ id: 'p-3', full_name: 'Otávio Bandeira', cpf: '11122233344', phone: '8511112222' }),
  ];
});

test('lists the patients and counts them in the subtitle', async ({ page, supabase }) => {
  await supabase.signIn();
  await page.goto('/patients');

  await expect(page.getByText('3 cadastrados')).toBeVisible();
  await expect(page.getByText('José Antônio da Silva')).toBeVisible();
  await expect(page.getByText('Marina Albuquerque')).toBeVisible();
});

test('search finds an accented name typed without accents', async ({ page, supabase }) => {
  await supabase.signIn();
  await page.goto('/patients');

  // The documented behaviour: "Jose" finds "José". Nobody types the accent into
  // a search box, and a list that answers "nenhum paciente" to a name that is
  // plainly there is the kind of bug that gets reported as data loss.
  await page.getByPlaceholder('Nome, CPF ou telefone').fill('jose');

  await expect(page.getByText('José Antônio da Silva')).toBeVisible();
  await expect(page.getByText('Marina Albuquerque')).toHaveCount(0);
});

test('search also matches CPF and phone', async ({ page, supabase }) => {
  await supabase.signIn();
  await page.goto('/patients');

  const field = page.getByPlaceholder('Nome, CPF ou telefone');

  await field.fill('98765432100');
  await expect(page.getByText('Marina Albuquerque')).toBeVisible();
  await expect(page.getByText('José Antônio da Silva')).toHaveCount(0);

  await field.fill('8511112222');
  await expect(page.getByText('Otávio Bandeira')).toBeVisible();
});

test('a search that matches nothing is told apart from having no patients', async ({
  page,
  supabase,
}) => {
  await supabase.signIn();
  await page.goto('/patients');

  await page.getByPlaceholder('Nome, CPF ou telefone').fill('zzzznobody');

  // Two different empty states, and conflating them is the classic version of
  // this bug: a doctor with a full history being told they have no patients.
  await expect(page.getByText('Nenhum paciente ainda')).toHaveCount(0);
  await expect(page.getByText('Nada encontrado')).toBeVisible();

  // And the way out is offered rather than left to be guessed at.
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByText('Marina Albuquerque')).toBeVisible();
});

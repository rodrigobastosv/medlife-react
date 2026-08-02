import type { Patient } from '@/domain/patients/patient';

/**
 * Who has a birthday in a given month — the rule behind the birthdays card on
 * Início.
 *
 * It lives in the domain, next to `summarizePatientAges`, for the same reason:
 * it is a statement about what a birth date *means*, it is a pure function of
 * its inputs, and nothing about it needs React to be reasoned about.
 */

export interface PatientBirthday {
  readonly patient: Patient;
  /** Day of the month the birth date carries, 1–31. */
  readonly day: number;
  /**
   * The age this birthday completes, or `null` when the birth date is in the
   * future.
   *
   * A future birth date is a typo, and "faz −2 anos" is a worse answer than no
   * answer. The patient still appears in the list, which is where somebody will
   * notice the date is wrong and fix it — dropping the row would hide the only
   * evidence of the mistake.
   */
  readonly turningAge: number | null;
}

/**
 * The age a birthday completes in `year`, or `null` when the birth date is in
 * the future.
 *
 * Exported because the agenda asks the same question of a range of days rather
 * than of a month, and "faz −2 anos" has to be impossible in both places — a
 * future birth date is a typo, and a second copy of this subtraction is a second
 * place for that typo to escape through.
 */
export function turningAgeIn(birthDate: Date, year: number): number | null {
  const age = year - birthDate.getFullYear();
  return age < 0 ? null : age;
}

/**
 * The patients whose birthday falls in `month`, earliest day first.
 *
 * **Only the month and the day are compared.** The year in a birth date is the
 * year the patient was born, so anything that compares whole `Date`s — or that
 * builds "this year's birthday" with `new Date(year, month, day)` and compares
 * that — matches nobody, or worse, matches the wrong people.
 *
 * That last form is also the reason **29 February is read straight off the
 * stored date and stays in February**. `new Date(2027, 1, 29)` silently
 * normalises to 1 March, so a leap-day patient would vanish from February and
 * surface in March in three years out of four — right when the clinic is
 * looking at the wrong month to call them. Keeping the recorded month is the
 * less surprising rule: a birthday recorded in February is a February birthday,
 * and whoever reads the card knows what to do with "29" in a year that has no
 * 29th. (Nothing here ever renders it as a full `dd/MM` date, precisely so the
 * card never prints a day that does not exist.)
 *
 * `month` is a whole `Date` rather than a month number because the caller
 * already holds one, and because the year is what tells us which birthday is
 * being turned. Only its month and year are read; the day is ignored.
 */
export function birthdaysInMonth(
  patients: readonly Patient[],
  month: Date,
): readonly PatientBirthday[] {
  const monthIndex = month.getMonth();
  const year = month.getFullYear();

  const birthdays: PatientBirthday[] = [];

  for (const patient of patients) {
    const birthDate = patient.birthDate;
    // A missing birth date is not a birthday on the 1st: patients whose date was
    // never filled in are simply absent from this list, exactly as they are
    // absent from the age statistics.
    if (birthDate === null) continue;
    if (birthDate.getMonth() !== monthIndex) continue;

    birthdays.push({
      patient,
      day: birthDate.getDate(),
      turningAge: turningAgeIn(birthDate, year),
    });
  }

  // Two people born on the same day would otherwise sit in whatever order the
  // query happened to return them in, which changes between refetches and makes
  // the list appear to reshuffle itself while nobody is touching it. The name is
  // the tiebreak, compared with the pt-BR collation so accented names sort where
  // a Brazilian reader expects them ("Ângela" beside "Ana", not after "Zuleica").
  birthdays.sort(
    (a, b) => a.day - b.day || a.patient.fullName.localeCompare(b.patient.fullName, 'pt-BR'),
  );

  return birthdays;
}

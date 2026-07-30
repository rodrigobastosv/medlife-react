import { ageFromBirthDate } from '@/core/format';
import type { Patient } from '@/domain/patients/patient';

/**
 * The age profile of a set of patients — the numbers behind the overview block
 * on the patients page.
 *
 * This lives in the domain rather than in the page for the same reason
 * `buildMonthlyReport` does: it is a rule about what the data *means*, it has no
 * opinion about React, and it is a pure function of its inputs, so the whole
 * calculation can be reasoned about (and tested) without rendering anything.
 */

/* ------------------------------------------------------------------------- */
/* Bands                                                                     */
/* ------------------------------------------------------------------------- */

export interface AgeBand {
  /** Axis caption under the bar ("70–79"). Unique — it is also the React key. */
  readonly label: string;
  /** Inclusive lower bound, in whole years. */
  readonly min: number;
  /** Inclusive upper bound, or `null` on the open-ended last band. */
  readonly max: number | null;
}

/**
 * Seven bands, cut for a geriatric practice.
 *
 * The resolution is deliberately lopsided: everything below 40 collapses into a
 * single bucket, and from there the bands are plain decades all the way up. A
 * geriatrician's patients cluster in the range a general split would flatten
 * into one or two bars — "60+" says almost nothing to someone whose whole
 * caseload is 60+, whereas the difference between a register centred on the 70s
 * and one centred on the 80s is the difference between two practices.
 *
 * Under-40s are not dropped, only merged. They are rare here but they do exist
 * (an early-onset referral, a patient inherited from another specialty), and a
 * bucket that is usually empty still has to be able to show them rather than
 * lose them off the bottom of the chart.
 *
 * The last band **must** keep `max: null` — the bucketing below relies on it to
 * guarantee that every age lands somewhere, including centenarians.
 */
export const AGE_BANDS: readonly AgeBand[] = [
  { label: 'Até 39', min: 0, max: 39 },
  { label: '40–49', min: 40, max: 49 },
  { label: '50–59', min: 50, max: 59 },
  { label: '60–69', min: 60, max: 69 },
  { label: '70–79', min: 70, max: 79 },
  { label: '80–89', min: 80, max: 89 },
  { label: '90+', min: 90, max: null },
];

/**
 * "70 a 79 anos" / "90 anos ou mais" / "Menos de 40 anos" — the spoken form, for
 * tooltips.
 *
 * The `min === 0` case is worded as an upper bound rather than as "0 a 39 anos",
 * which would read as a claim that the practice sees newborns. The bucket means
 * "everyone below the range this clinic works in", and that is how it is said.
 * It is the one form that starts with a letter rather than a digit, and it is
 * capitalised because every caller uses this at the start of a sentence.
 */
export const ageBandDescription = (band: AgeBand): string => {
  if (band.min === 0) return `Menos de ${(band.max ?? 0) + 1} anos`;
  if (band.max === null) return `${band.min} anos ou mais`;
  return `${band.min} a ${band.max} anos`;
};

/**
 * The same range as a phrase that attaches to a noun — "paciente **de 70 a 79
 * anos**", "paciente **com menos de 40 anos**".
 *
 * Separate from `ageBandDescription` because the preposition changes with the
 * shape of the band, and pasting the standalone description into a sentence
 * produces "Nenhum paciente 70 a 79 anos". A bare `de` reads wrong in front of
 * "menos de", hence the two forms.
 */
export const ageBandPhrase = (band: AgeBand): string => {
  if (band.min === 0) return `com menos de ${(band.max ?? 0) + 1} anos`;
  if (band.max === null) return `com ${band.min} anos ou mais`;
  return `de ${band.min} a ${band.max} anos`;
};

/* ------------------------------------------------------------------------- */
/* Summary                                                                   */
/* ------------------------------------------------------------------------- */

export interface AgeBandCount {
  readonly band: AgeBand;
  readonly count: number;
}

export interface PatientAgeSummary {
  /** Every patient handed in, whether or not their age is known. */
  readonly total: number;
  /** Patients the statistics below are computed from. */
  readonly withBirthDate: number;
  /** Patients left out of the statistics because their birth date is missing. */
  readonly withoutBirthDate: number;
  /** One entry per band, in `AGE_BANDS` order, including the empty ones. */
  readonly bands: readonly AgeBandCount[];
  /**
   * `null` — not `0` — when no age is known. An average of zero patients is not
   * zero years old, and a caller that has to handle `null` cannot accidentally
   * print "0 anos" for a practice that simply has not filled in birth dates.
   */
  readonly averageAge: number | null;
  readonly medianAge: number | null;
  readonly youngestAge: number | null;
  readonly oldestAge: number | null;
}

/**
 * Buckets and averages the patients' ages.
 *
 * Patients with no birth date are **excluded** from every figure rather than
 * counted as age 0: a missing date is not a newborn, and folding it in would
 * drag the average down by an amount proportional to how incomplete the
 * register is. They are reported separately as `withoutBirthDate` so the screen
 * can say out loud how many patients the numbers do not cover.
 *
 * `reference` defaults to now and is a parameter so the calculation can be
 * pinned to a fixed date in a test — an age summary that reads the clock
 * internally is one that gives a different answer on someone's birthday.
 */
export function summarizePatientAges(
  patients: readonly Patient[],
  reference: Date = new Date(),
): PatientAgeSummary {
  const counts = AGE_BANDS.map(() => 0);
  const ages: number[] = [];

  for (const patient of patients) {
    const age = patientAge(patient, reference);
    if (age === null) continue;

    ages.push(age);

    const index = bandIndexFor(age);
    counts[index] = (counts[index] ?? 0) + 1;
  }

  const bands = AGE_BANDS.map((band, index) => ({ band, count: counts[index] ?? 0 }));

  if (ages.length === 0) {
    return {
      total: patients.length,
      withBirthDate: 0,
      withoutBirthDate: patients.length,
      bands,
      averageAge: null,
      medianAge: null,
      youngestAge: null,
      oldestAge: null,
    };
  }

  // Sorted once, then reused for the median and for both ends of the range —
  // three passes over the same array collapse into one.
  ages.sort((a, b) => a - b);
  const sum = ages.reduce((total, age) => total + age, 0);

  return {
    total: patients.length,
    withBirthDate: ages.length,
    withoutBirthDate: patients.length - ages.length,
    bands,
    averageAge: sum / ages.length,
    medianAge: medianOfSorted(ages),
    youngestAge: ages[0] ?? null,
    oldestAge: ages[ages.length - 1] ?? null,
  };
}

/** True when at least one age is known — the precondition for drawing anything. */
export const hasAgeData = (summary: PatientAgeSummary): boolean => summary.withBirthDate > 0;

/**
 * A patient's age in whole years, or `null` when their birth date is unknown.
 *
 * Clamped at zero: a birth date in the future is a typo, and letting it through
 * as a negative age would both miss every band and pull the average below
 * anything a person can be. Treating it as a newborn keeps the patient visible
 * in the chart, where the outlier can be spotted and fixed.
 */
export function patientAge(patient: Patient, reference: Date = new Date()): number | null {
  if (patient.birthDate === null) return null;
  return Math.max(0, ageFromBirthDate(patient.birthDate, reference));
}

/**
 * The band a patient falls in, or `null` when their age is unknown.
 *
 * This is the same lookup the summary counts with — deliberately, so that
 * clicking a bar selects exactly the patients that bar counted. Two independent
 * implementations would be free to disagree at a boundary, and the bar would
 * then promise a number the list below it could not produce.
 */
export function ageBandOfPatient(patient: Patient, reference: Date = new Date()): AgeBand | null {
  const age = patientAge(patient, reference);
  return age === null ? null : (AGE_BANDS[bandIndexFor(age)] ?? null);
}

/** The band carrying this label, for turning a chart selection back into a band. */
export const findAgeBand = (label: string): AgeBand | undefined =>
  AGE_BANDS.find((band) => band.label === label);

/**
 * The first band that can still hold this age.
 *
 * Reading the bands in order and taking the first whose ceiling is not yet
 * passed means the lower bounds never have to be checked, so a gap or an
 * overlap in the table above cannot silently drop a patient. The last band has
 * no ceiling, so the search always succeeds; the fallback is only there because
 * `findIndex` cannot know that.
 */
function bandIndexFor(age: number): number {
  const index = AGE_BANDS.findIndex((band) => band.max === null || age <= band.max);
  return index === -1 ? AGE_BANDS.length - 1 : index;
}

/**
 * The middle value of an already-sorted list; the mean of the two middle values
 * when the count is even. Callers must sort first — sorting in here would hide
 * an O(n log n) pass behind a name that sounds free.
 */
function medianOfSorted(ages: readonly number[]): number {
  const middle = Math.floor(ages.length / 2);
  if (ages.length % 2 === 1) return ages[middle] ?? 0;
  return ((ages[middle - 1] ?? 0) + (ages[middle] ?? 0)) / 2;
}

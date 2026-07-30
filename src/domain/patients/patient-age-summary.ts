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
  /** Axis caption under the bar ("45–59"). Unique — it is also the React key. */
  readonly label: string;
  /** Inclusive lower bound, in whole years. */
  readonly min: number;
  /** Inclusive upper bound, or `null` on the open-ended last band. */
  readonly max: number | null;
}

/**
 * Six bands, weighted towards adults.
 *
 * These are not equal-width buckets on purpose. Equal widths (0–9, 10–19, …)
 * would spend half the chart on ages this practice barely sees and squash the
 * range where its patients actually are. The split used here is the one a
 * clinic reads without a legend: everything under 18 is a single "minors"
 * bucket, adults are cut at the points where risk and follow-up change (30, 45,
 * 60), and 75+ is left open because there is no meaningful ceiling.
 *
 * The last band **must** keep `max: null` — the bucketing below relies on it to
 * guarantee that every age lands somewhere.
 */
export const AGE_BANDS: readonly AgeBand[] = [
  { label: '0–17', min: 0, max: 17 },
  { label: '18–29', min: 18, max: 29 },
  { label: '30–44', min: 30, max: 44 },
  { label: '45–59', min: 45, max: 59 },
  { label: '60–74', min: 60, max: 74 },
  { label: '75+', min: 75, max: null },
];

/** "45 a 59 anos" / "75 anos ou mais" — the spoken form, for tooltips. */
export const ageBandDescription = (band: AgeBand): string =>
  band.max === null ? `${band.min} anos ou mais` : `${band.min} a ${band.max} anos`;

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
    if (patient.birthDate === null) continue;

    // Clamped at zero: a birth date in the future is a typo, and letting it
    // through as a negative age would both miss every band and pull the average
    // below anything a person can be. Treating it as a newborn keeps the
    // patient visible in the chart, where the outlier can be spotted and fixed.
    const age = Math.max(0, ageFromBirthDate(patient.birthDate, reference));
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

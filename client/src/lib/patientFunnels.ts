/**
 * Shared helpers for rendering EVERY funnel assigned to the active case on the
 * Dashboard and Documents pages.
 *
 * Both pages already receive the full funnel list from `get-patient-funnels`
 * (it returns an array), but historically only rendered the first item
 * (`funnels[0]`) and fetched submission-details for that one funnel. This module
 * centralizes: (1) normalizing the funnel list, (2) normalizing a funnel's forms,
 * (3) fetching every funnel's forms together, and (4) the progress/CTA math — so
 * the two pages identify and render funnels consistently.
 *
 * The single-funnel visuals on each page are unchanged; this only removes the
 * "keep first item" narrowing so multiple assigned funnels can be displayed.
 */
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";

/** A single form inside a funnel (submission-details). Kept permissive because
 *  the backend shape varies; callers read id/form_id/submission_status/title. */
export type PatientFunnelFormSummary = Record<string, any>;

export interface PatientAssignedFunnel {
  /** Stable funnel id used for navigation (`/form/:funnelId`). */
  funnelId: string | number;
  /** Display name. */
  funnelName: string;
  /** Funnel-level status from get-patient-funnels (e.g. "completed"). */
  submissionStatus?: string;
  /** Forms belonging to THIS funnel only (submission-details). */
  forms: PatientFunnelFormSummary[];
  /** Per-funnel forms fetch error, when that one funnel failed to load. */
  formsError?: string | null;
}

const FUNNEL_LIST_CANDIDATE_KEYS = (response: any): any[] => [
  response,
  response?.data,
  response?.data?.data,
  response?.funnels,
  response?.funnel,
  response?.patient_funnels,
  response?.data?.funnels,
  response?.data?.funnel,
  response?.data?.patient_funnels,
  response?.data?.data?.funnels,
  response?.data?.data?.funnel,
  response?.data?.data?.patient_funnels,
];

const FUNNEL_FORMS_CANDIDATE_KEYS = (response: any): any[] => [
  response?.data?.data?.forms,
  response?.data?.forms,
  response?.forms,
  response?.data?.data,
  response?.data,
  response,
];

export const getFunnelName = (funnel: any): string =>
  funnel?.funnel_name || funnel?.name || funnel?.title || "Untitled Funnel";

export const getFunnelId = (funnel: any): string | number | undefined =>
  funnel?.id ?? funnel?.funnel_id;

/**
 * Normalize the get-patient-funnels response into a funnel list, dropping only
 * entries that lack a usable funnel id (per the partial-response rule). The raw
 * funnel object is preserved on each entry for callers that need extra fields.
 */
export function normalizeCaseFunnels(
  response: any
): { funnelId: string | number; funnelName: string; submissionStatus?: string }[] {
  const list = FUNNEL_LIST_CANDIDATE_KEYS(response).find((candidate) => Array.isArray(candidate));
  if (!Array.isArray(list)) return [];

  const result: { funnelId: string | number; funnelName: string; submissionStatus?: string }[] = [];
  for (const funnel of list) {
    const funnelId = getFunnelId(funnel);
    if (funnelId === undefined || funnelId === null || funnelId === "") continue; // skip invalid
    result.push({
      funnelId,
      funnelName: getFunnelName(funnel),
      submissionStatus: funnel?.submission_status,
    });
  }
  return result;
}

/** Normalize a get-patient-funnel-submission-details response into a forms array. */
export function normalizeFunnelForms(response: any): PatientFunnelFormSummary[] {
  const forms = FUNNEL_FORMS_CANDIDATE_KEYS(response).find((candidate) => Array.isArray(candidate));
  return Array.isArray(forms) ? forms : [];
}

/**
 * Fetch every funnel assigned to the active case, plus each funnel's forms.
 *
 * The active case is applied automatically by the axios interceptor (`?case_id`),
 * so callers must ensure the desired case is selected before calling. A single
 * failing funnel does not fail the whole list — its `formsError` is set and its
 * forms fall back to an empty array so the remaining funnels still render.
 */
export async function fetchCaseFunnelsWithForms(): Promise<PatientAssignedFunnel[]> {
  const funnelsResponse = await Apis.getPatientFunnels();

  if (funnelsResponse?.success === false) {
    throw new Error(funnelsResponse?.message || funnelsResponse?.error || "Failed to load funnels");
  }

  const baseFunnels = normalizeCaseFunnels(funnelsResponse);

  const withForms = await Promise.all(
    baseFunnels.map(async (funnel): Promise<PatientAssignedFunnel> => {
      try {
        const formsResponse = await Apis.getPatientFunnelSubmissionDetails(funnel.funnelId);
        return { ...funnel, forms: normalizeFunnelForms(formsResponse), formsError: null };
      } catch (error) {
        return { ...funnel, forms: [], formsError: getApiErrorMessage(error) || "Failed to load forms" };
      }
    })
  );

  return withForms;
}

export const isFunnelFormCompleted = (form: PatientFunnelFormSummary): boolean =>
  form?.submission_status === "completed";

export interface FunnelProgress {
  total: number;
  completed: number;
  pending: number;
  progress: number;
  allCompleted: boolean;
  noneCompleted: boolean;
}

/** Progress math for ONE funnel's forms — matches the existing per-page logic. */
export function computeFunnelProgress(forms: PatientFunnelFormSummary[]): FunnelProgress {
  const total = forms.length;
  const completed = forms.filter(isFunnelFormCompleted).length;
  const pending = total - completed;
  return {
    total,
    completed,
    pending,
    progress: total > 0 ? (completed / total) * 100 : 0,
    allCompleted: total > 0 && pending === 0,
    noneCompleted: pending === total,
  };
}

/** Start/Resume/Completed label, computed from a single funnel's own progress. */
export function getFunnelCtaLabel(progress: FunnelProgress): string {
  if (progress.total === 0) return "Start Form";
  if (progress.allCompleted) return "Form Completed";
  if (progress.noneCompleted) return "Start Form";
  return "Resume Form";
}

/** Sum of pending forms across every funnel (accurate overall pending total). */
export function sumPendingForms(funnels: PatientAssignedFunnel[]): number {
  return funnels.reduce((total, funnel) => total + computeFunnelProgress(funnel.forms).pending, 0);
}

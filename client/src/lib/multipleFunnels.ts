/**
 * Multiple-funnel magic-link support.
 *
 * A magic link may carry a decoded `is_multiple_funnels` flag. When enabled, the
 * patient must NOT be sent straight to the single decoded `form`. Instead, after
 * authentication/account creation and case synchronization, a modal lists every
 * funnel assigned to the patient+case so they can pick which form to open.
 *
 * This module contains ONLY pure helpers, the pending-redirect session record,
 * and the API-response normalizer. It intentionally imports nothing from the
 * API/axios layer so it is safe to import from api.ts (avoids a circular import).
 */

/**
 * Safely interpret the decoded `is_multiple_funnels` value.
 * Enabled only for explicit truthy representations the backend may send.
 * Absent, empty, "0" and "false" are NOT enabled.
 */
export function isMultipleFunnelsEnabled(value: unknown): boolean {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

/**
 * Normalized funnel shape consumed by the selection modal. The backend response
 * shape is not yet confirmed, so all optional fields are populated defensively
 * from the field aliases we currently expect (see normalizeAssignedFunnels).
 */
export interface AssignedFunnel {
  id: string | number;
  funnelId: string | number;
  funnelName: string;
  submissionStatus?: string;
  pendingCount?: number;
  completedCount?: number;
  totalCount?: number;
}

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Defensively normalize the assigned-funnels API response into AssignedFunnel[].
 *
 * The confirmed response shape is not yet available, so this unwraps the common
 * candidate paths, drops items without a usable funnel id, and de-duplicates by
 * funnel id. Keep ALL shape-guessing here so the UI can stay clean.
 */
export function normalizeAssignedFunnels(response: any): AssignedFunnel[] {
  const candidates = [
    response,
    response?.data,
    response?.data?.data,
    response?.funnels,
    response?.data?.funnels,
    response?.assigned_funnels,
    response?.data?.assigned_funnels,
    response?.data?.data?.funnels,
    response?.data?.data?.assigned_funnels,
  ];

  const list = candidates.find((candidate) => Array.isArray(candidate));
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const result: AssignedFunnel[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;

    const funnelIdRaw = item.funnel_id ?? item.funnelId ?? item.id;
    if (funnelIdRaw === undefined || funnelIdRaw === null || funnelIdRaw === "") continue;

    const dedupeKey = String(funnelIdRaw);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const funnelName =
      item.funnel_name ?? item.funnelName ?? item.name ?? item.title ?? "";

    result.push({
      id: item.id ?? funnelIdRaw,
      funnelId: funnelIdRaw,
      funnelName: String(funnelName).trim() || "Untitled Form",
      submissionStatus: item.submission_status ?? item.submissionStatus ?? undefined,
      pendingCount: toNumberOrUndefined(item.pending_count ?? item.pendingCount),
      completedCount: toNumberOrUndefined(item.completed_count ?? item.completedCount),
      totalCount: toNumberOrUndefined(item.total_count ?? item.totalCount),
    });
  }

  return result;
}

/**
 * SessionStorage key holding the pending multiple-funnel continuation. Kept
 * separate from the single-funnel redirect keys so both systems coexist. It is
 * preserved across the same storage clears that preserve the other magic-link
 * keys (see api.ts 401 handler, TokenValidator, AuthContext initializeAuth).
 */
export const MULTIPLE_FUNNEL_PENDING_KEY = "ahcs_multiple_funnel_pending_redirect";

/**
 * Fired whenever the pending record is written or cleared. Hosts (the modal and
 * the dashboard entry point) re-read the record and update their UI.
 */
export const MULTIPLE_FUNNELS_EVENT = "ahcs:multiple-funnels-changed";

/**
 * Fired when the user explicitly asks to (re)open the selection modal, e.g. via
 * the dashboard "View assigned forms" entry point. Distinct from the change
 * event so closing the modal never auto-reopens it.
 */
export const MULTIPLE_FUNNELS_OPEN_EVENT = "ahcs:multiple-funnels-open";

export interface MultipleFunnelPendingRedirect {
  patient_id: string;
  case_id: string;
  form: string;
  funnel_name: string;
  source: string;
  flag: string;
  is_multiple_funnels: true;
  created_at: number;
}

const dispatchDomEvent = (name: string): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name));
};

export interface StoreMultipleFunnelPendingInput {
  patient_id: string;
  case_id: string;
  form?: string;
  funnel_name?: string;
  source?: string;
  flag?: string;
}

/**
 * Persist the pending multiple-funnel continuation and notify listeners.
 * Requires patient_id and case_id — callers must fall back to the single-funnel
 * flow when either is missing.
 */
export function storeMultipleFunnelPendingRedirect(input: StoreMultipleFunnelPendingInput): void {
  const patientId = String(input.patient_id ?? "").trim();
  const caseId = String(input.case_id ?? "").trim();
  if (!patientId || !caseId) return;

  const record: MultipleFunnelPendingRedirect = {
    patient_id: patientId,
    case_id: caseId,
    form: String(input.form ?? ""),
    funnel_name: String(input.funnel_name ?? ""),
    source: String(input.source ?? ""),
    flag: String(input.flag ?? ""),
    is_multiple_funnels: true,
    created_at: Date.now(),
  };

  sessionStorage.setItem(MULTIPLE_FUNNEL_PENDING_KEY, JSON.stringify(record));
  dispatchDomEvent(MULTIPLE_FUNNELS_EVENT);
}

/**
 * Read and defensively validate the pending record. Returns null (and clears the
 * stale value) when it is missing, malformed, or lacks the ids needed to fetch.
 */
export function readMultipleFunnelPendingRedirect(): MultipleFunnelPendingRedirect | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(MULTIPLE_FUNNEL_PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MultipleFunnelPendingRedirect>;
    const patientId = String(parsed?.patient_id ?? "").trim();
    const caseId = String(parsed?.case_id ?? "").trim();

    if (!patientId || !caseId) {
      sessionStorage.removeItem(MULTIPLE_FUNNEL_PENDING_KEY);
      return null;
    }

    return {
      patient_id: patientId,
      case_id: caseId,
      form: String(parsed?.form ?? ""),
      funnel_name: String(parsed?.funnel_name ?? ""),
      source: String(parsed?.source ?? ""),
      flag: String(parsed?.flag ?? ""),
      is_multiple_funnels: true,
      created_at: Number(parsed?.created_at) || 0,
    };
  } catch {
    sessionStorage.removeItem(MULTIPLE_FUNNEL_PENDING_KEY);
    return null;
  }
}

/**
 * Remove the pending record and notify listeners. Call ONLY after a successful
 * funnel selection/navigation or an explicit user cancellation — never during
 * intermediate login, password-creation, or case-refresh steps.
 */
export function clearMultipleFunnelPendingRedirect(): void {
  sessionStorage.removeItem(MULTIPLE_FUNNEL_PENDING_KEY);
  dispatchDomEvent(MULTIPLE_FUNNELS_EVENT);
}

/** Ask the host modal to (re)open for the current pending record. */
export function requestOpenMultipleFunnelsModal(): void {
  dispatchDomEvent(MULTIPLE_FUNNELS_OPEN_EVENT);
}

/** Stable identity for a pending record, used to avoid duplicate processing. */
export function multipleFunnelRecordSignature(record: MultipleFunnelPendingRedirect): string {
  return `${record.patient_id}|${record.case_id}|${record.created_at}`;
}

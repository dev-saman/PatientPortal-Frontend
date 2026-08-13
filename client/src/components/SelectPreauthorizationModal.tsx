import { X, ChevronRight, CalendarDays, AlertCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { formatDate } from "@/lib/utils";

/**
 * A single approved/active preauthorization record as returned by
 * `GET /get-approved-preauth`. The backend already filters to
 * status = "Approved" AND no_sessions > 0, so every record here is "active".
 */
export interface PreauthRecord {
  case_id: number | string;
  ma_id: number | string;
  medauth_facility?: string | null;
  service?: string | null;
  pa_req?: string | null;
  pa_resp?: string | null;
  visit_type?: string | null;
  /**
   * Human-readable visit-type name (e.g. "Physical Therapy") for `visit_type`'s code
   * ("PT"). Not yet returned by the API — see BR-14 in
   * SCHEDULE_FLOW_BACKEND_REQUIREMENTS.md. The preauth card falls back to the raw code
   * until the backend supplies it; the frontend does not map codes to names itself.
   */
  visit_type_name?: string | null;
  referred_by_physician?: string | null;
  referred_company_name?: string | null;
  referred_physician_code?: string | null;
  physician_id?: number | string | null;
  status?: string | null;
  svc_date_start?: string | null;
  svc_date_end?: string | null;
  ext_date?: string | null;
  is_details_missing?: boolean;
  /**
   * Backend-computed flag: true when the preauth has everything required to
   * schedule (Location, Specialty, Visit Type, Provider, ...). Readiness is
   * decided by the API, never by the frontend.
   */
  is_ready_for_scheduling?: boolean;
  /**
   * Backend flag: true once the patient has submitted an activation request for this
   * preauth and it is still awaiting approval. Only meaningful while the preauth is
   * not yet ready — see `preauthState`.
   */
  sent_request?: boolean;
  /**
   * Backend-owned session counts from `GET /get-approved-preauth`. The API owns the
   * arithmetic; the badge is hidden when they are absent.
   */
  no_sessions?: number | null;         // total approved sessions
  sessions_remaining?: number | null;  // sessions still available (backend-computed)
  sessions_completed?: number | null;  // not currently returned; preferred when present
  /**
   * Backend flag deciding whether this preauth's visit type may be booked by the
   * patient: 1 = self-service scheduling allowed, 0 = the patient must phone the
   * facility. The API owns the rule; the frontend only reads it. May currently come
   * back `null` — see `isCallOnlyVisitType` for how that is treated.
   */
  allow_visit_type?: number | null;
  /**
   * The facility's phone number, already formatted by the backend
   * (e.g. "(214) 941-4550"). Shown when `allow_visit_type` is 0.
   */
  facility_phone_no?: string | null;
  /** Backend-owned scheduling counter returned by the API; not read by the UI yet. */
  schedule?: number | null;
  /**
   * The patient's OWN appointments for THIS preauth, from `GET /get-approved-preauth`.
   * Patient-scoped (unlike the anonymized booked slots in get-time-slots-date-range),
   * so the scheduling modal uses `upcoming_appt` to mark dates the patient already
   * booked. Times are 24h "HH:MM:SS"; `attend_date` is "YYYY-MM-DD".
   */
  appointments?: {
    upcoming_appt?: PreauthAppointment[];
    past_appt?: PreauthAppointment[];
  };
  [key: string]: any;
}

/** One of the patient's booked appointments under a preauth. */
export interface PreauthAppointment {
  attend_date: string; // YYYY-MM-DD
  time: string;        // 24h "HH:MM:SS"
  end_time: string;    // 24h "HH:MM:SS"
  attend_status?: string | null;
}

/**
 * Reads the backend-provided readiness flag for a preauth. This is a field read,
 * not a validation rule — the API owns the "all required info present?" logic so
 * the same rules can be shared with other clients. Prefers the explicit
 * `is_ready_for_scheduling` flag; falls back to `is_details_missing` for
 * backwards compatibility until the backend confirms the field name.
 */
export const isPreauthReady = (p: PreauthRecord): boolean =>
  p.is_ready_for_scheduling ?? (p.is_details_missing !== true);

/**
 * Reads the backend's `allow_visit_type` flag: true when the visit type may NOT be
 * self-booked and the patient has to phone the facility instead. Only an explicit 0
 * blocks — `null`/`undefined` (the backend does not always populate the field yet)
 * falls through to the normal slot flow rather than locking every patient out.
 * This is a field read, not a business rule; the API owns the decision.
 */
export const isCallOnlyVisitType = (allowVisitType: unknown): boolean =>
  allowVisitType !== null && allowVisitType !== undefined && Number(allowVisitType) === 0;

/** The three display/interaction states of a preauth card. */
export type PreauthState = "ready" | "under-review" | "activation-required";

/**
 * Resolves a preauth to one of three states, purely from backend flags:
 *  - `ready`               → schedulable
 *  - `under-review`        → an activation request was already sent (`sent_request`)
 *                            and is awaiting approval; not schedulable
 *  - `activation-required` → not ready and no request sent yet
 * Readiness always wins: once the backend marks a preauth ready, a stale
 * `sent_request` no longer matters.
 */
export const preauthState = (p: PreauthRecord): PreauthState => {
  if (isPreauthReady(p)) return "ready";
  return p.sent_request === true ? "under-review" : "activation-required";
};

/**
 * Session usage for the badge: `used / total`, plus the remaining count for the
 * tooltip. The API returns `no_sessions` (total approved) and `sessions_remaining`
 * but no used count, so `used` is derived as total − remaining. Note the backend's
 * `sessions_remaining` nets out completed *and* already-scheduled sessions, so
 * "used" here means completed + scheduled. Returns null when the counts are absent,
 * which hides the badge.
 */
export const sessionUsage = (
  p: PreauthRecord,
): { used: number; total: number; remaining: number } | null => {
  const total = p.no_sessions;
  if (typeof total !== "number") return null;

  const remaining =
    typeof p.sessions_remaining === "number"
      ? p.sessions_remaining
      : typeof p.sessions_completed === "number"
        ? Math.max(0, total - p.sessions_completed)
        : null;
  if (remaining === null) return null;

  const used =
    typeof p.sessions_completed === "number"
      ? p.sessions_completed
      : Math.max(0, total - remaining);

  return { used, total, remaining };
};

interface Props {
  open: boolean;
  onClose: () => void;
  preauths: PreauthRecord[];
  onSelect: (preauth: PreauthRecord) => void;
  onActivationRequired: (preauth: PreauthRecord) => void;
}

const dash = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? "—" : s;
};

// Visit type shown as "Physical Therapy (PT)" — the backend's display name followed by
// its code. `visit_type_name` is not returned yet (BR-14), so until it is this degrades to
// the bare code. Purely presentational: no code→name mapping happens on the frontend.
const visitTypeLabel = (p: PreauthRecord) => {
  const code = p.visit_type == null ? "" : String(p.visit_type).trim();
  const name = p.visit_type_name == null ? "" : String(p.visit_type_name).trim();
  if (name && code) return `${name} (${code})`;
  return name || code || "—";
};

// Display-only formatting: the record keeps the backend's YYYY-MM-DD values.
const dateRange = (p: PreauthRecord) => {
  const start = formatDate(p.svc_date_start);
  const end = formatDate(p.svc_date_end);
  if (!start && !end) return "—";
  return `${start || "—"} – ${end || "—"}`;
};

// Per-state card presentation. Under-review preauths cannot be scheduled, so they
// read as neutral/grey rather than as an actionable error.
const STATE_STYLES: Record<PreauthState, { border: string; dot: string; text: string; label: string }> = {
  ready: {
    border: "border-border hover:border-primary/50 hover:bg-muted/40",
    dot: "bg-green-500",
    text: "text-green-600",
    label: "Ready to schedule",
  },
  "under-review": {
    border: "border-border hover:border-muted-foreground/40 hover:bg-muted/40",
    dot: "bg-gray-400",
    text: "text-gray-500",
    label: "Under Review",
  },
  "activation-required": {
    border: "border-red-200 hover:border-red-300 hover:bg-red-50/50",
    dot: "bg-red-500",
    text: "text-red-600",
    label: "Activation required",
  },
};

export default function SelectPreauthorizationModal({ open, onClose, preauths, onSelect, onActivationRequired }: Props) {
  // Selecting a row immediately triggers the next step — no Continue button.
  // Only ready preauths proceed to scheduling. Both not-ready states open the
  // Activation Required flow, which renders itself read-only ("Under Review") when
  // a request is already pending. Readiness is the API's call.
  const handleRowClick = (p: PreauthRecord) => {
    if (preauthState(p) === "ready") {
      onSelect(p);
    } else {
      onActivationRequired(p);
    }
  };

  // Show schedulable ("Ready to schedule") preauths first so the actionable one is
  // immediately visible. Array.sort is stable, so within each group the original order
  // is preserved.
  const orderedPreauths = [...preauths].sort(
    (a, b) => (preauthState(a) === "ready" ? 0 : 1) - (preauthState(b) === "ready" ? 0 : 1),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[900px] w-[90%] max-h-[90vh] p-5 gap-0 pointer-events-auto flex flex-col"
      >
        <DialogHeader className="pb-4 border-b border-border min-h-auto flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-xl font-semibold">
              Select Preauthorization
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <p className="text-sm text-muted-foreground pt-4">
          You have multiple active preauthorizations. Select one to continue scheduling.
        </p>

        <div className="py-4 space-y-3 overflow-auto flex-1">
          {orderedPreauths.map((p, index) => {
            const state = preauthState(p);
            const styles = STATE_STYLES[state];
            const usage = sessionUsage(p);
            return (
              <button
                key={`${p.ma_id}-${index}`}
                type="button"
                onClick={() => handleRowClick(p)}
                className={`w-full text-left rounded-lg border p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${styles.border}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {dash(p.medauth_facility)}
                      </span>
                      {usage && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="tabular-nums">
                              {usage.used}/{usage.total}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Remaining Sessions: {usage.remaining}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                        <span className={styles.text}>{styles.label}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                      {/* Deliberately minimal: only the visit type and the authorized
                          date range are shown. Service, referring physician and company
                          were removed to restrict what the portal exposes on this card. */}
                      <div>
                        <span className="text-foreground/70">Visit Type: </span>
                        {visitTypeLabel(p)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        {dateRange(p)}
                      </div>
                    </div>
                  </div>
                  {state === "ready" ? (
                    <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : state === "under-review" ? (
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

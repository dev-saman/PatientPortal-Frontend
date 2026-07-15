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
  [key: string]: any;
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
          {preauths.map((p, index) => {
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
                      <div>
                        <span className="text-foreground/70">Service / Visit type: </span>
                        {dash(p.service)}{p.pa_req ? ` / ${p.pa_req}` : ""}
                      </div>
                      <div>
                        <span className="text-foreground/70">Referring physician: </span>
                        {dash(p.referred_by_physician)}
                      </div>
                      <div>
                        <span className="text-foreground/70">Company: </span>
                        {dash(p.referred_company_name)}
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

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ChevronRight, AlertCircle, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Apis from "@/lib/Apis";
import {
  AssignedFunnel,
  MultipleFunnelPendingRedirect,
  MULTIPLE_FUNNELS_EVENT,
  MULTIPLE_FUNNELS_OPEN_EVENT,
  clearMultipleFunnelPendingRedirect,
  consumeMultipleFunnelPendingRedirect,
  multipleFunnelRecordSignature,
  normalizeAssignedFunnels,
  readMultipleFunnelPendingRedirect,
} from "@/lib/multipleFunnels";
import { applyCaseContext, getActiveCaseId, patientIdMatchesToken } from "@/lib/caseContext";

const ERROR_TOAST_STYLE = { backgroundColor: "#ef4444", color: "#ffffff" } as const;

/**
 * App-level host for the multiple-funnel selection modal.
 *
 * Mounted once (App.tsx) so it can be opened from either continuation path:
 *  - EmailLinkHandler (already-logged-in links) — stores the pending record and
 *    navigates to "/"; this component reads it on mount.
 *  - AuthContext.login() — post-login for new/existing users; fires the change
 *    and open events after landing on "/".
 *
 * It reads the pending record from sessionStorage (written by
 * storeMultipleFunnelPendingRedirect), ensures the link's case is active, fetches
 * the assigned funnels, and lets the patient pick which form to open. The record
 * is cleared ONLY on successful selection or explicit dismissal — never during
 * intermediate auth/case steps — so a closed modal can be reopened.
 */
export default function MultipleFunnelSelectionModal() {
  const { isAuthenticated, refreshUserDetails } = useAuth();
  const [, setLocation] = useLocation();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [funnels, setFunnels] = useState<AssignedFunnel[]>([]);
  const [pendingRecord, setPendingRecord] = useState<MultipleFunnelPendingRedirect | null>(null);
  const [selectingId, setSelectingId] = useState<string | number | null>(null);

  // Signature of the record we've already started processing — prevents the
  // same link from fetching twice or auto-reopening after the user closes it.
  const processedSigRef = useRef<string | null>(null);
  // Guards against overlapping fetches (rapid rerenders / repeated events).
  const fetchingRef = useRef(false);

  // Latest values reachable from stable callbacks/DOM listeners without making
  // those callbacks change identity every render.
  const isAuthedRef = useRef(isAuthenticated);
  const refreshRef = useRef(refreshUserDetails);
  const uiStateRef = useRef({ error: false, loading: false, funnelsCount: 0 });
  useEffect(() => {
    isAuthedRef.current = isAuthenticated;
  });
  useEffect(() => {
    refreshRef.current = refreshUserDetails;
  });
  useEffect(() => {
    uiStateRef.current = { error, loading, funnelsCount: funnels.length };
  }, [error, loading, funnels.length]);

  // Ensure the link's case is active, then fetch its assigned funnels.
  const runFlow = useCallback(async (record: MultipleFunnelPendingRedirect) => {
    if (fetchingRef.current) return;

    // Defense-in-depth: never show another patient's funnels.
    if (!patientIdMatchesToken(record.patient_id)) {
      clearMultipleFunnelPendingRedirect();
      processedSigRef.current = null;
      toast.error("This link belongs to a different patient account. Please log out and open the link again.", {
        style: ERROR_TOAST_STYLE,
      });
      return;
    }

    fetchingRef.current = true;
    setPendingRecord(record);
    // Consume the pending record the moment the modal takes ownership of it. Its
    // data now lives in component state (for selection/retry this session), so a
    // page refresh, navigation, or case change will NOT reshow the modal — it is
    // a one-shot for the magic-link arrival.
    consumeMultipleFunnelPendingRedirect();
    setFunnels([]);
    setError(false);
    setLoading(true);
    setOpen(true);

    try {
      // Fallback case sync. The magic-link entry points (EmailLinkHandler and
      // AuthContext.login) already pre-select the link's case before this modal
      // mounts, so this rarely runs. When it does, the refresh is fire-and-forget
      // so the funnel fetch below — which passes case_id explicitly and is exempt
      // from the interceptor — is never blocked on getPatientDetails.
      if (record.case_id && getActiveCaseId() !== record.case_id) {
        applyCaseContext(record.case_id);
        refreshRef.current().catch(() => {});
      }

      const response = await Apis.checkMultipleAssignFunnel(record.patient_id, record.case_id);
      setFunnels(normalizeAssignedFunnels(response));
      setLoading(false);
    } catch {
      setLoading(false);
      setError(true);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Process a newly-arrived record. Never auto-reopens an already-handled one.
  const processNewIfNeeded = useCallback(() => {
    if (!isAuthedRef.current) return;

    const record = readMultipleFunnelPendingRedirect();
    // No pending record → nothing to open. Do NOT force-close here: the modal is
    // consumed on show, so its open state is owned by the user's actions
    // (select / close), not by the record's presence. Closing on absence would
    // shut the modal the instant it consumes its own record.
    if (!record) return;

    const signature = multipleFunnelRecordSignature(record);
    if (signature === processedSigRef.current) return; // already handled

    processedSigRef.current = signature;
    runFlow(record);
  }, [runFlow]);

  // Explicit user request to (re)open — e.g. dashboard "View assigned forms".
  const handleOpenRequest = useCallback(() => {
    if (!isAuthedRef.current) return;

    const record = readMultipleFunnelPendingRedirect();
    if (!record) return;

    const signature = multipleFunnelRecordSignature(record);
    const ui = uiStateRef.current;
    if (signature === processedSigRef.current && ui.funnelsCount > 0 && !ui.error && !ui.loading) {
      setOpen(true); // reopen without refetching
      return;
    }

    processedSigRef.current = signature;
    runFlow(record);
  }, [runFlow]);

  // Initial check + whenever auth settles (covers post-login navigation to "/").
  useEffect(() => {
    processNewIfNeeded();
  }, [isAuthenticated, processNewIfNeeded]);

  // React to record changes (store/clear) and explicit reopen requests.
  useEffect(() => {
    const onChange = () => processNewIfNeeded();
    const onOpen = () => handleOpenRequest();
    window.addEventListener(MULTIPLE_FUNNELS_EVENT, onChange);
    window.addEventListener(MULTIPLE_FUNNELS_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(MULTIPLE_FUNNELS_EVENT, onChange);
      window.removeEventListener(MULTIPLE_FUNNELS_OPEN_EVENT, onOpen);
    };
  }, [processNewIfNeeded, handleOpenRequest]);

  const handleSelect = async (funnel: AssignedFunnel) => {
    if (selectingId !== null) return; // block double-clicks across all rows

    const funnelId = funnel.funnelId ?? funnel.id;
    if (funnelId === undefined || funnelId === null || funnelId === "") {
      toast.error("This form is unavailable. Please choose another.", { style: ERROR_TOAST_STYLE });
      return;
    }

    setSelectingId(funnelId);
    try {
      const targetCase = pendingRecord?.case_id;
      if (targetCase && getActiveCaseId() !== targetCase) {
        applyCaseContext(targetCase);
        try {
          await refreshRef.current();
        } catch {
          // Non-blocking — form page will still load with the switched case.
        }
      }
      // Consume the continuation now that navigation is committed.
      clearMultipleFunnelPendingRedirect();
      setOpen(false);
      setLocation(`/form/${encodeURIComponent(String(funnelId))}`);
    } finally {
      setSelectingId(null);
    }
  };

  // Keep the pending record when the user simply closes the dialog (they can
  // reopen from the dashboard entry point). Do not clear it here.
  const handleOpenChange = (next: boolean) => {
    if (!next) setOpen(false);
  };

  // Explicit acknowledgement from empty/error states — safe to discard.
  const handleDismissAndClear = () => {
    clearMultipleFunnelPendingRedirect();
    setOpen(false);
  };

  const handleRetry = () => {
    if (!pendingRecord) return;
    setError(false);
    runFlow(pendingRecord);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a form to continue</DialogTitle>
          <DialogDescription>
            Multiple forms have been assigned to this case. Choose the form you want to complete.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10" aria-live="polite">
            <Loader2 className="h-7 w-7 animate-spin text-red-700" />
            <p className="text-sm text-gray-500">Loading your assigned forms…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" aria-live="assertive">
            <AlertCircle className="h-8 w-8 text-red-600" />
            <p className="text-sm font-medium text-gray-900">We could not load the assigned forms.</p>
            <div className="mt-1 flex items-center gap-2">
              <Button onClick={handleRetry} className="bg-red-700 hover:bg-red-800 text-white gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button variant="outline" onClick={handleDismissAndClear}>
                Go to dashboard
              </Button>
            </div>
          </div>
        ) : funnels.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <FileText className="h-8 w-8 text-gray-400" />
            <p className="text-sm font-medium text-gray-900">No assigned forms were found for this case.</p>
            <Button variant="outline" onClick={handleDismissAndClear} className="mt-1">
              Go to dashboard
            </Button>
          </div>
        ) : (
          <div
            className="space-y-3 max-h-[60vh] overflow-y-auto pr-1"
            role="list"
            aria-label="Assigned forms"
          >
            {funnels.map((funnel) => {
              const funnelKey = String(funnel.funnelId);
              const isSelecting = selectingId === (funnel.funnelId ?? funnel.id);
              const hasCounts =
                typeof funnel.completedCount === "number" && typeof funnel.totalCount === "number";
              return (
                <button
                  key={funnelKey}
                  type="button"
                  role="listitem"
                  disabled={selectingId !== null}
                  onClick={() => handleSelect(funnel)}
                  aria-label={`Open form ${funnel.funnelName}`}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-red-300 hover:bg-red-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-900">{funnel.funnelName}</div>
                    {(funnel.submissionStatus || hasCounts || typeof funnel.pendingCount === "number") && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        {funnel.submissionStatus && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium capitalize text-gray-600">
                            {funnel.submissionStatus.replace(/_/g, " ")}
                          </span>
                        )}
                        {hasCounts ? (
                          <span>
                            {funnel.completedCount} of {funnel.totalCount} completed
                          </span>
                        ) : (
                          typeof funnel.pendingCount === "number" && (
                            <span>
                              {funnel.pendingCount} pending form{funnel.pendingCount === 1 ? "" : "s"}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-sm font-medium text-red-700 group-hover:underline sm:inline">
                      Open Form
                    </span>
                    {isSelecting ? (
                      <Loader2 className="h-4 w-4 animate-spin text-red-700" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-red-700" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

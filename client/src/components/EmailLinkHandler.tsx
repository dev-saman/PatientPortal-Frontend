import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  isEncodedEmailLink,
  decodeEmailLinkParams,
  storeEmailLinkData,
} from "@/lib/decodeEmailLink";
import { useAuth } from "@/contexts/AuthContext";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  getFormPath,
  getValidFormId,
  storePendingMagicLinkRedirect,
  URL_CASE_ID_KEY,
} from "@/lib/magicLink";
import { patientIdMatchesToken, applyCaseContext, getActiveCaseId } from "@/lib/caseContext";
import { isMultipleFunnelsEnabled, storeMultipleFunnelPendingRedirect } from "@/lib/multipleFunnels";

/**
 * EmailLinkHandler
 *
 * Detects Base64-encoded email link parameters in the URL.
 * If found, decodes them, stores in sessionStorage, and redirects appropriately.
 * If URL is a normal route (no encoded params), renders children normally.
 */
export function EmailLinkHandler({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, refreshUserDetails } = useAuth();
  const { toast } = useToast();
  const [isHandlingMagicLink, setIsHandlingMagicLink] = useState(false);
  // Set true once a magic link has been fully processed. This is a real state
  // change (false -> true) that GUARANTEES a re-render, so the loader clears even
  // when the handler navigates to the SAME pathname it is already on (e.g. an
  // already-logged-in link that routes back to "/"). Without it the component
  // never re-renders in that case: wouter's useSyncExternalStore snapshot for the
  // pathname is unchanged, and setIsHandlingMagicLink(true)->(false) batches to a
  // net no-op — leaving the app frozen on the spinner.
  const [linkResolved, setLinkResolved] = useState(false);
  // Process a given magic-link URL exactly once. Without this guard the effect
  // re-runs when auth state settles (isAuthenticated flips during session
  // restore) while the async case switch is still in flight, firing a second
  // handler that switches the case twice and leaves the page stuck on the
  // loader until a manual reload.
  const handledSearchRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait until auth has finished initializing so the logged-in branch below
    // reads stable state instead of racing the session restore.
    if (isLoading) return;

    const search = window.location.search;
    if (!isEncodedEmailLink(search)) return;
    if (handledSearchRef.current === search) return;
    handledSearchRef.current = search;

    const handleMagicLink = async () => {
      setIsHandlingMagicLink(true);
      try {
        // Strip the encoded magic-link query from the address bar now that
        // `search` is captured. wouter's setLocation is a no-op when the target
        // equals the current path, so a link at "/" that routes back to "/"
        // (e.g. an already-logged-in multi-funnel link) would otherwise leave
        // the query in the URL — keeping hasPendingMagicLink true and pinning
        // this handler on the loading spinner forever. Clearing it here makes
        // every subsequent navigation behave regardless of target path.
        if (typeof window !== "undefined" && window.history?.replaceState) {
          window.history.replaceState(null, "", window.location.pathname + window.location.hash);
        }

        const decoded = decodeEmailLinkParams(search);
        if (!decoded) {
          setLocation("/");
          return;
        }

        const validFormId = getValidFormId(decoded.form);
        const formPath = getFormPath(decoded.form);

        // Multiple-funnel mode swaps the single-form target for a picker modal.
        // It only needs patient_id + case_id (not a valid `form`), so these links
        // are handled below BEFORE the single-funnel form guard.
        const isMultiFunnel = isMultipleFunnelsEnabled(decoded.is_multiple_funnels);
        const hasMultiFunnelIds = !!decoded.patient_id && !!String(decoded.case_id || "").trim();
        const canMultiFunnel = isMultiFunnel && hasMultiFunnelIds;

        const hasToken = !!localStorage.getItem("ahcs_token");
        const isSmsSource = decoded.source?.toLowerCase() === "sms";
        const isEmailSource = decoded.source?.toLowerCase() === "email";
        const decodedCaseId = String(decoded.case_id || "").trim();
        const currentCaseIdAtEntry = getActiveCaseId();

        // Persist the URL case_id immediately so the post-login flow can
        // apply it even if the primary pending-redirect mechanism is bypassed.
        // Written before any async call so nothing clears it first.
        if (decodedCaseId) {
          sessionStorage.setItem(URL_CASE_ID_KEY, decodedCaseId);
        }

        // ---- Multiple-funnel magic links ----
        // Handled here, before the single-funnel form guard, because they do not
        // require a valid `form`. We stash a pending record and let the app-level
        // selection modal take over after authentication + case sync. When
        // patient_id or case_id is missing (canMultiFunnel === false) we fall
        // through to the existing single-funnel behavior below, unchanged.
        if (canMultiFunnel) {
          const alreadyLoggedIn = hasToken || isAuthenticated;

          // Wrong-account guard — same rule as the single-funnel guard below.
          if (alreadyLoggedIn && !patientIdMatchesToken(decoded.patient_id)) {
            sessionStorage.removeItem(URL_CASE_ID_KEY);
            toast({
              title: "Wrong Account",
              description: "This link belongs to a different patient account. Please logout and then try the link again.",
              variant: "destructive",
            });
            setLocation("/");
            return;
          }

          // Persist the continuation. Survives the login / create-password
          // navigations and is consumed only on successful funnel selection.
          storeMultipleFunnelPendingRedirect({
            patient_id: decoded.patient_id,
            case_id: decodedCaseId,
            form: validFormId || decoded.form || "",
            funnel_name: decoded.funnel_name || "",
            source: decoded.source || "",
            flag: decoded.flag || "",
          });

          if (alreadyLoggedIn) {
            // Pre-sync the link's case BEFORE navigating (mirrors
            // AuthContext.login for the not-logged-in path). This is written
            // directly to localStorage — without dispatching a case-change
            // event — so the app-level modal finds the case already active and
            // does NOT perform a mid-mount case switch. Doing that switch inside
            // the modal remounts the page content while it is still
            // initializing, which left the app stuck on the loader.
            if (decodedCaseId && getActiveCaseId() !== decodedCaseId) {
              localStorage.setItem("ahcs_selected_case_id", decodedCaseId);
              refreshUserDetails().catch(() => {});
            }
            setLocation("/");
            return;
          }

          // Not logged in: route through the correct pre-auth step. For SMS we
          // still verify to choose create-password vs login; both converge on
          // the modal after authentication.
          if (isSmsSource) {
            try {
              const verifyResponse = await Apis.verifyMagicLink(decoded.patient_id);
              const verifyFlag = verifyResponse?.flag?.toLowerCase();
              if (verifyFlag === "exist") {
                setLocation("/login");
              } else {
                storeEmailLinkData({ ...decoded, form: validFormId || decoded.form || "0" });
                setLocation("/reset-password");
              }
            } catch (error) {
              toast({
                title: "Verification Failed",
                description: getApiErrorMessage(error),
                variant: "destructive",
              });
              setLocation("/");
            }
            return;
          }

          if (decoded.flag === "user_exists") {
            setLocation("/login");
          } else {
            // New user: create a password first. ResetPassword reads
            // ahcs_email_link_data and posts /add-patient-to-funnel as today.
            storeEmailLinkData({ ...decoded, form: validFormId || decoded.form || "0" });
            setLocation("/reset-password");
          }
          return;
        }

        // ---- Single-funnel path (unchanged) ----
        // A valid form is required from here on. This guard also narrows
        // validFormId/formPath to non-null for the rest of the handler.
        if (!validFormId || !formPath) {
          setLocation("/");
          return;
        }

        /**
         * Switches to the URL's case_id using the same mechanism as the sidebar
         * case dropdown, then fetches fresh patient details for the new case
         * before navigating to the form page.
         *
         * Flow:
         *  1. Fetch the patient's full case list to validate the URL case.
         *  2. Confirm the URL case_id is in that list.
         *  3. Apply the case switch via applyCaseContext (localStorage write +
         *     CASE_CONTEXT_CHANGED_EVENT) — mirrors the Layout dropdown onChange.
         *  4. Call refreshUserDetails() so getPatientDetails fires with the new
         *     case_id before Layout mounts. This ensures patient data (name,
         *     email, etc.) reflects the switched case for all subsequent renders.
         *  5. Navigate to the form path.
         */
        const navigateToFormWithCaseSync = async () => {
          if (decodedCaseId) {
            const currentCaseId = getActiveCaseId();

            if (currentCaseId !== decodedCaseId) {
              // Step 1 — fetch the patient's available case IDs for validation.
              let availableCaseIds: string[] = [];
              try {
                const userData = localStorage.getItem("ahcs_user_data");
                const parsedUserData = userData ? JSON.parse(userData) : null;
                const email: string = parsedUserData?.email || "";

                if (email) {
                  const caseResponse = await Apis.getCaseIdsByEmail(email);
                  const raw =
                    caseResponse?.data?.case_ids ||
                    caseResponse?.case_ids ||
                    caseResponse?.data?.data ||
                    caseResponse?.data ||
                    caseResponse ||
                    [];
                  if (Array.isArray(raw)) {
                    availableCaseIds = raw
                      .map((item: any) =>
                        typeof item === "string" || typeof item === "number"
                          ? String(item)
                          : String(item?.case_id || item?.id || item || "")
                      )
                      .filter(Boolean);
                  }
                }
              } catch {
                // Could not fetch case ID list — proceeding with URL case
              }

              // Step 2 — validate. If the list fetch failed (empty), allow the
              // switch and let the backend reject truly invalid access later.
              const isValidCaseId =
                availableCaseIds.length === 0 || availableCaseIds.includes(decodedCaseId);

              if (isValidCaseId) {
                // Step 3 — apply the case switch (same as sidebar dropdown):
                //   localStorage.setItem("ahcs_selected_case_id", decodedCaseId)
                //   + dispatch CASE_CONTEXT_CHANGED_EVENT
                // We skip change-patient-case API because it scopes to the
                // primary patient_id and rejects secondary-patient cases.
                applyCaseContext(decodedCaseId);

                // Step 4 — refresh patient details using the new case so that
                // getPatientDetails is called with case_id=decodedCaseId BEFORE
                // Layout mounts. The axios interceptor reads the active case from
                // localStorage (now decodedCaseId), so the request goes to:
                //   GET get-patient-details?case_id=<decodedCaseId>
                try {
                  await refreshUserDetails();
                } catch {
                  // Non-blocking — the form can still load with the correct case
                  // even if the patient details refresh fails.
                }
              }
            }
          }

          // Clean up the URL case_id from sessionStorage — for logged-in users
          // this is applied via applyCaseContext above, not via login().
          sessionStorage.removeItem(URL_CASE_ID_KEY);

          setLocation(formPath);
        };

        // Defense-in-depth: a logged-in user must not be switched into a case
        // from a link meant for a different patient. Block and send them to
        // their own dashboard without changing case.
        const isWrongAccount = (hasToken || isAuthenticated) && !patientIdMatchesToken(decoded.patient_id);
        if (isWrongAccount) {
          sessionStorage.removeItem(URL_CASE_ID_KEY);
          toast({
            title: "Wrong Account",
            description: "This link belongs to a different patient account. Please logout and then try the link again.",
            variant: "destructive",
          });
          setLocation("/");
          return;
        }

        if (isSmsSource) {
          if (hasToken || isAuthenticated) {
            try {
              await navigateToFormWithCaseSync();
            } catch (error) {
              toast({
                title: "Unable to Switch Case",
                description: getApiErrorMessage(error),
                variant: "destructive",
              });
              setLocation("/");
            }
            return;
          }

          if (!decoded.patient_id) {
            setLocation("/");
            return;
          }

          try {
            const verifyResponse = await Apis.verifyMagicLink(decoded.patient_id);
            const verifyFlag = verifyResponse?.flag?.toLowerCase();

            storePendingMagicLinkRedirect(validFormId, search, decodedCaseId || undefined, decoded.patient_id || undefined);

            if (verifyFlag === "exist") {
              sessionStorage.setItem("ahcs_user_exists_form_redirect", JSON.stringify({ ...decoded, form: validFormId }));
              setLocation("/login");
            } else {
              storeEmailLinkData({ ...decoded, form: validFormId });
              setLocation("/reset-password");
            }
          } catch (error) {
            toast({
              title: "Verification Failed",
              description: getApiErrorMessage(error),
              variant: "destructive",
            });
            setLocation("/");
          }

          return;
        }

        if (isEmailSource) {
          if (hasToken || isAuthenticated) {
            try {
              await navigateToFormWithCaseSync();
            } catch (error) {
              toast({
                title: "Unable to Switch Case",
                description: getApiErrorMessage(error),
                variant: "destructive",
              });
              setLocation("/");
            }
            return;
          }

          if (!decoded.patient_id) {
            setLocation("/");
            return;
          }

          storePendingMagicLinkRedirect(validFormId, search, decodedCaseId || undefined, decoded.patient_id || undefined);

          // Trust the flag baked into the email link by the backend. A live
          // verifyMagicLink call was previously used here but its response can
          // disagree with the encoded flag (different backend paths), causing
          // user_exists links to wrongly land on /reset-password.
          if (decoded.flag === "user_exists") {
            sessionStorage.setItem("ahcs_user_exists_form_redirect", JSON.stringify({ ...decoded, form: validFormId }));
            setLocation("/login");
          } else {
            storeEmailLinkData({ ...decoded, form: validFormId });
            setLocation("/reset-password");
          }

          return;
        }

        if (decoded.flag === "user_exists") {
          if (hasToken || isAuthenticated) {
            try {
              await navigateToFormWithCaseSync();
            } catch (error) {
              toast({
                title: "Unable to Switch Case",
                description: getApiErrorMessage(error),
                variant: "destructive",
              });
              setLocation("/");
            }
          } else {
            storePendingMagicLinkRedirect(validFormId, search, decodedCaseId || undefined, decoded.patient_id || undefined);
            sessionStorage.setItem("ahcs_user_exists_form_redirect", JSON.stringify({ ...decoded, form: validFormId }));
            setLocation("/login");
          }
        } else {
          // no_user flag. If this patient is already logged in (the token's
          // patient_id matches the link — the wrong-account guard above already
          // bounced a different patient), the account now exists, e.g. the link
          // is being reused after registration. Skip Create Password and go to
          // the form like the user_exists flow.
          const isAlreadyRegisteredPatient =
            (hasToken || isAuthenticated) && patientIdMatchesToken(decoded.patient_id);

          if (isAlreadyRegisteredPatient) {
            try {
              await navigateToFormWithCaseSync();
            } catch (error) {
              toast({
                title: "Unable to Switch Case",
                description: getApiErrorMessage(error),
                variant: "destructive",
              });
              setLocation("/");
            }
          } else {
            storePendingMagicLinkRedirect(validFormId, search, decodedCaseId || undefined, decoded.patient_id || undefined);
            storeEmailLinkData({ ...decoded, form: validFormId });
            setLocation("/reset-password");
          }
        }
      } finally {
        setIsHandlingMagicLink(false);
        // Force a re-render so the loader clears even when the destination
        // pathname equals the current one (see linkResolved declaration).
        setLinkResolved(true);
      }
    };

    handleMagicLink();
  }, [isLoading, isAuthenticated, setLocation, toast]);

  // While an encoded magic link is still in the URL (and auth has finished
  // initializing), keep the app shell unmounted and show the loader. Otherwise
  // the root "/" route mounts ProtectedRoute, whose effect redirects an
  // unauthenticated visitor to /login before this handler can route the link
  // (e.g. to /reset-password for a new user). The navigation below clears the
  // query string, which drops this guard and renders children normally.
  const hasPendingMagicLink =
    !isLoading && !linkResolved && isEncodedEmailLink(window.location.search);

  if (isHandlingMagicLink || hasPendingMagicLink) {
    return <LoadingSpinner />;
  }

  return <>{children}</>;
}

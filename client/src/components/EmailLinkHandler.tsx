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
        const decoded = decodeEmailLinkParams(search);
        if (!decoded) {
          setLocation("/");
          return;
        }

        const validFormId = getValidFormId(decoded.form);
        const formPath = getFormPath(decoded.form);
        if (!validFormId || !formPath) {
          setLocation("/");
          return;
        }

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
  const hasPendingMagicLink = !isLoading && isEncodedEmailLink(window.location.search);

  if (isHandlingMagicLink || hasPendingMagicLink) {
    return <LoadingSpinner />;
  }

  return <>{children}</>;
}

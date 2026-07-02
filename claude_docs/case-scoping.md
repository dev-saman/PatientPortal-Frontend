---
name: case-scoping
description: "The multi-case model — ahcs_selected_case_id, automatic ?case_id injection, and exempt endpoints"
metadata: 
  node_type: memory
  type: project
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

A patient can have **multiple cases**; almost all data is scoped to the *currently selected* case. This is the single most important cross-cutting concept in the app.

- Active case id = `localStorage["ahcs_selected_case_id"]`, read via `getActiveCaseId()` in `lib/api.ts`. The sidebar case selector writes this key; `Apis.getCaseIdsByEmail(email)` lists a user's cases.
- The axios **request interceptor auto-appends `?case_id=<active>`** to every request whose URL does NOT contain an entry in `CASE_ID_EXEMPT_ENDPOINTS` (defined in `lib/api.ts`). This is why most `Apis` methods take no case argument — the case rides along automatically for both GET and POST.
- **Exempt endpoints** (must stay user-scoped or carry case_id explicitly): `get-case-ids-by-email`, `change-patient-case`, `login`, `logout`, `magic-link`, `password/forgot`, `attach/preview`, `download-patient-form-pdf`, `download-patient-submited-form-pdf`, `check-sessions-completed`, `get-time-slots-date-range`, `available-time-slots`, `appointment-reschedule`. The appointment/slot endpoints instead pass `case_id` (and `ma_id`) explicitly, sourced from the `get-approved-preauth` response.
- Switching case: `Apis.changePatientCase(caseId)` (backend) vs. just writing `ahcs_selected_case_id` locally. During magic-link login the code deliberately sets the local key ONLY (avoids a token rotation that could 401 and force logout right after login — see [[magic-link-email-flows]]).
- `SelectedCaseContext` (`contexts/SelectedCaseContext.tsx`) exposes `{selectedCaseId, caseIdsFetchDone}` to components.
- **Ordering gotcha:** `lib/funnels.ts` `resolveCurrentCaseFunnelId()` reads funnels scoped to the active case, so it must be called only AFTER `ahcs_selected_case_id` has been updated, else it resolves against the old case.

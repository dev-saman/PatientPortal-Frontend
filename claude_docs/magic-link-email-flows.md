---
name: magic-link-email-flows
description: "Email-link/magic-link login→form redirect flows, the sessionStorage keys that drive them, and all ahcs_* storage keys"
metadata: 
  node_type: memory
  type: project
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

The portal is entered via emailed/SMS links that deep-link a patient to a specific intake form for a specific case, often requiring login or password setup first. This flow is intricate and spread across several files — treat changes as risky.

**Key files:** `components/EmailLinkHandler.tsx` (wraps the app, processes the link on load), `components/TokenValidator.tsx`, `lib/magicLink.ts`, `lib/decodeEmailLink.ts`, `lib/caseContext.ts` (`patientIdMatchesToken`), and the large redirect logic inside `AuthContext.login()`.

**Mechanism:** `EmailLinkHandler` decodes the link, immediately stashes the URL `case_id` in `sessionStorage["ahcs_url_case_id"]` (last-resort fallback, consumed once at login), and stores a pending redirect (`storePendingMagicLinkRedirect`). After login, `AuthContext.login()` consumes the pending redirect, verifies the link's `patient_id` matches the token (`patientIdMatchesToken` — mismatch shows a "Wrong Account" toast and sends to `/`), sets the local `ahcs_selected_case_id`, non-blockingly `refreshUserDetails()`, then navigates to `/form/:funnelId` (via `getFormPath`; form id "0"/non-numeric = no form → `/`).

**Form redirect variants**, in priority order inside login(): magic-link pending redirect → `ahcs_user_exists_form_redirect` (existing-user email-link flow, JSON with `case_id`+`form`) → `ahcs_sms_no_user_form_redirect` (SMS new-user after password setup) → `ahcs_password_reset_flow` → generic `?redirect=` param / role home. The whole block is duplicated for the token-decode-failure fallback path.

**All `ahcs_*` storage keys:**
- localStorage: `ahcs_token` (JWT), `ahcs_user_data` (decoded profile), `ahcs_selected_case_id` (active case — see [[case-scoping]]).
- sessionStorage: `ahcs_magic_link_pending_redirect`, `ahcs_url_case_id`, `ahcs_user_exists_form_redirect`, `ahcs_sms_no_user_form_redirect`, `ahcs_password_reset_flow`, `ahcs_forgot_email`, `ahcs_forgot_token`, `ahcs_email_link_data`.

Logout / 401 clear all storage but intentionally re-preserve `ahcs_user_exists_form_redirect` and `ahcs_magic_link_pending_redirect` so an in-flight link survives.

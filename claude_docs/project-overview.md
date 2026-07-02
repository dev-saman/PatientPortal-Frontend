---
name: project-overview
description: "What the AHCS Patient Portal frontend is, its user roles, and its main feature areas"
metadata: 
  node_type: memory
  type: project
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

The repo is the **AHCS (Advantage Home Care Services) Patient Portal** frontend — package name `ahcs-patient-portal`. It is a patient-facing web portal that also contains staff- and admin-facing screens, integrating with the AHCS Laravel backend (default API base `https://adm.advantagehcs.com/api`).

Three roles: **patient**, **staff**, **admin** (see [[auth-session-model]]). The portal is overwhelmingly patient-centric today — staff/admin pages are mostly stubs (see [[gotchas-legacy]]).

Main patient feature areas (routes → pages under `client/src/pages/`):
- Dashboard (`/` → PatientDashboard.tsx)
- Appointments (`/appointments` — scheduling/reschedule against provider time slots)
- Messages (`/messages` — MessagingSystem)
- Health (`/health`)
- Billing (`/billing`)
- **Documents (`/documents` — Documents.tsx, ~2000 lines, the largest/most complex feature)**: clinical documents, submitted forms, administrative notes, PDF view/download/merge.
- Patient funnel forms (`/form/:funnelId` → PatientFunnelForm.tsx) — dynamic intake forms tied to a case's funnel (see [[magic-link-email-flows]] and [[case-scoping]]).
- Profile (`/profile` — includes proxy management: invite/revoke/history), Learning (`/learning`).

A core domain concept is the **patient "case"**: a patient can have multiple cases, and nearly all data is scoped to the currently selected case (see [[case-scoping]]).

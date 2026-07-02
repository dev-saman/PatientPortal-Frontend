---
name: gotchas-legacy
description: "Known TypeScript errors, stub pages, and unused/legacy files to be aware of before editing"
metadata: 
  node_type: memory
  type: project
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

**Pre-existing type errors (per AGENTS.md):** `pnpm run check` already reports TS errors in `client/src/contexts/AuthContext.tsx` and `client/src/pages/Documents.tsx`. Don't attribute these to your change unless you touched those files.

**Stub pages (16-line placeholders, not real features yet):** `pages/StaffDashboard.tsx` and all of `pages/admin/` (`Dashboard.tsx`, `UserManagement.tsx`, `Reports.tsx`, `AdminSettings.tsx`). The staff/admin routes exist in `App.tsx` and are role-guarded, but the screens are essentially empty. The product is patient-focused today (see [[project-overview]]).

**Unused / legacy files** — these exist but are NOT wired into `App.tsx`'s router; don't assume editing them changes the running app:
- `pages/not-found.tsx` (21 lines) is the one actually imported as `NotFound`; `pages/NotFound.tsx` (49 lines) is the unused variant.
- `pages/Dashboard.tsx` (764 lines) and `pages/Home.tsx` (218 lines) are not routed — App imports `PatientDashboard` for `/` and `admin/Dashboard` for `/admin`.
- Confirm a file is actually imported in `App.tsx` before editing a "page".

**Largest / most complex files** (where real work concentrates): `Documents.tsx` (~2067 lines), `PatientFunnelForm.tsx` (~1091), `Appointments.tsx` (~845), `PatientDashboard.tsx` (~630), `Profile.tsx` (~518). (`pages/Dashboard.tsx` at ~764 lines is large but legacy/unrouted — see above.)

**Wouter is patched** (`patches/wouter@3.7.1.patch` via pnpm `patchedDependencies`) — don't bump/replace wouter without accounting for the patch. `nanoid` is pinned to 3.3.7 via a pnpm override for tailwind.

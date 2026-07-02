---
name: auth-session-model
description: "How auth/session works — JWT in localStorage, role mapping, ProtectedRoute guard, token expiry, 401 handling"
metadata: 
  node_type: memory
  type: project
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

Auth lives in `client/src/contexts/AuthContext.tsx` (`AuthProvider` / `useAuth` / `useUserData`).

**Token:** login posts `email`+`password` as FormData to `login`; on success a **JWT is stored in `localStorage["ahcs_token"]`** (see [[storage-keys]] in [[magic-link-email-flows]]). There is NO refresh token — the JWT is decoded client-side with `jwt-decode`. `isValidJWT()` checks format + `exp`. Full decoded user data is cached in `localStorage["ahcs_user_data"]`.

**Session restore:** on mount, if a valid token exists the user is rehydrated from the token; if expired/invalid, storage is cleared and the app routes to `/login`. A `setInterval` every 60s re-checks expiry and force-logs-out on expiry.

**Roles:** JWT `role` claim → app role. `App.tsx` maps `{admin→admin, staff→staff, user→patient}`, defaulting unknown to **patient**. Type `UserRole = "patient" | "staff" | "admin"`.

**Routing guard:** `ProtectedRoute` in `App.tsx` checks `isAuthenticated` + `allowedRoles`. Unauthenticated → `/login?redirect=<path>`. Wrong role → redirected to that role's home (`/admin`, `/staff`, or `/`). Redirects happen in a `useEffect` (avoids setState-during-render); the component renders `null` while redirecting and `<LoadingSpinner/>` while `isLoading`.

**401 handling:** the axios **response interceptor** (`lib/api.ts`) clears storage and hard-redirects `window.location.href = "/login"` on any 401 (unless already on `/login`). It preserves the `ahcs_user_exists_form_redirect` and magic-link pending-redirect sessionStorage keys across the clear.

`isAuthenticated` is simply `!!user`. Preserve token storage key, guard behavior, and 401 handling when editing (per AGENTS.md this is auth-sensitive → high-reasoning work).

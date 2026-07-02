# Project Memory — PatientPortal-Frontend (AHCS Patient Portal)

- [Project Overview](project-overview.md) — what the AHCS Patient Portal is and who uses it
- [Tech Stack & Structure](tech-stack-structure.md) — React 19 + TS + Vite monorepo (client/server/shared), aliases, UI kit
- [Auth & Session Model](auth-session-model.md) — JWT-in-localStorage, role mapping, ProtectedRoute guard, 401 handling
- [API Layer](api-layer.md) — Apis class → Network() → axios interceptor; how requests are built
- [Case Scoping (Multi-Case)](case-scoping.md) — ahcs_selected_case_id auto-injected as ?case_id, exempt endpoints
- [Magic Link & Email Flows](magic-link-email-flows.md) — email-link/magic-link login→form redirect flows and sessionStorage keys
- [Project Facts](project-facts.md) — repo, branches, deploy, env vars, commands (corrects AGENTS.md)
- [Gotchas & Legacy Files](gotchas-legacy.md) — known TS errors, stub pages, unused legacy files

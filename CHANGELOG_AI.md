# CHANGELOG_AI

An auditable, human-readable record of every change made by an AI assistant
(Claude Code) to this repository — features, enhancements, bug fixes, refactors,
and notable configuration/docs changes.

**Conventions**
- Newest entries at the **top**.
- One entry per task/change-set. Use the date (`YYYY-MM-DD`) as the heading.
- For each entry note: **What** changed, **Files/areas** touched, and any
  **Auth / case-scoping / patient-data** considerations (mirrors the
  "Output Required" section of `AGENTS.md`).
- **Scope:** AI-made changes are logged automatically. The developer's own
  manual changes are logged only when the developer explicitly asks the AI to
  record them (the AI reads `git log`/`git diff` to do so).
- This log is maintained by the AI assistant per the standing project
  convention; it does not replace `git log`.

---

## 2026-07-02

### Reconciled AGENTS.md Git Workflow with local-only rules and real deploy
- **What:** Rewrote the "Git Workflow" section: developer handles all Git;
  the AI runs read-only Git only and never commits/pushes/branches unless
  explicitly asked. Corrected stale deploy facts (`staging`→Cloudways via
  `deploy-staging.yml`, not `main`→`deploy.yml`).
- **Files/areas:** `AGENTS.md`.
- **Auth / case-scoping / patient-data:** None — process/guidance only.

### Added Context Intake and UI Consistency checklists to AGENTS.md
- **What:** Added a "Context Intake Checklist" (read memory/docs → analyze →
  review code + Git status → plan → wait for approval → implement locally →
  update CHANGELOG_AI.md → summarize files; never commit/push unless asked) and
  a "UI Consistency Checklist" (design system, tokens-not-hex, typography,
  spacing, components, responsiveness, dark mode, accessibility, conventions).
- **Files/areas:** `AGENTS.md`.
- **Auth / case-scoping / patient-data:** None — process/guidance only.

### Set CHANGELOG scope to "AI + manual-on-request"
- **What:** Clarified that this log records AI-made changes automatically, and
  the developer's manual changes only when explicitly requested.
- **Files/areas:** `CHANGELOG_AI.md` (Conventions), `AGENTS.md`
  (CHANGELOG rule).
- **Auth / case-scoping / patient-data:** None — documentation/process only.

### Added AI knowledge base and CHANGELOG_AI convention
- **What:** Established a project knowledge base under `claude_docs/` (overview,
  tech stack, auth/session model, API layer, case scoping, magic-link/email
  flows, project facts, gotchas) and introduced this `CHANGELOG_AI.md`. Added a
  rule to `AGENTS.md` requiring every code change to be recorded here.
- **Files/areas:** `claude_docs/*.md` (new), `CHANGELOG_AI.md` (new),
  `AGENTS.md` (session-startup + output-required rules).
- **Auth / case-scoping / patient-data:** None — documentation and process only;
  no application code, endpoints, or auth behavior changed.

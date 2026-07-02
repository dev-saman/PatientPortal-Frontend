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
- This log is maintained by the AI assistant per the standing project
  convention; it does not replace `git log`.

---

## 2026-07-02

### Added AI knowledge base and CHANGELOG_AI convention
- **What:** Established a project knowledge base under `claude_docs/` (overview,
  tech stack, auth/session model, API layer, case scoping, magic-link/email
  flows, project facts, gotchas) and introduced this `CHANGELOG_AI.md`. Added a
  rule to `AGENTS.md` requiring every code change to be recorded here.
- **Files/areas:** `claude_docs/*.md` (new), `CHANGELOG_AI.md` (new),
  `AGENTS.md` (session-startup + output-required rules).
- **Auth / case-scoping / patient-data:** None — documentation and process only;
  no application code, endpoints, or auth behavior changed.

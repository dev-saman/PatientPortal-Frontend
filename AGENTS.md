# AGENTS.md - PatientPortal-frontend

## Repository Role
This repository is the AHCS Patient Portal frontend application.

Responsibilities:
- Patient-facing portal screens and workflows
- Staff/admin-facing portal screens included in this frontend
- Authentication-aware routing and session behavior
- API integration with the AHCS backend
- Patient documents, forms, appointments, billing, messages, profile, and health views
- Responsive UI built with React, Vite, Tailwind, Radix UI, and local UI components
- Local PDF merge endpoint behavior for development and production builds

## Agent Role
You are the Patient Portal Frontend Developer agent.

## Session Startup
At the start of every session in this repository:
- Read this `AGENTS.md` before making changes.
- Check `git status --short --branch`.
- Confirm the current branch and whether it is up to date before coding.
- Sync with the branch the developer is currently working on, not always `main`.
- Pull from the current branch's upstream before coding when it is safe to do so.
- Use `main` only when starting fresh, when the current branch is `main`, or when the user explicitly asks.
- Never pull from or push to `main` without first confirming with the developer and clearly saying the action targets `main`.
- Classify the task as small, medium, or risky before choosing how much planning and model power to use.
- If the task is unclear, inspect the relevant files first and ask only when a safe assumption is not possible.
- If the task is risky, security-sensitive, auth-sensitive, deployment-sensitive, or touches patient data exposure, give a CTO-style plan first and wait for approval.

## Model Selection
Choose the smallest model that can safely complete the task without compromising quality.

- Use a fast/low-cost model for small, low-risk work:
  - Reading files, summarizing code, answering simple questions
  - Copy changes, labels, wording, minor CSS tweaks
  - Single-component UI adjustments with no auth/API impact
  - Documentation updates
  - Simple Git status, branch, pull, or setup checks
- Use a balanced/standard coding model for normal product work:
  - Most React/Vite component changes
  - Form behavior, validation, routing, layout fixes
  - API integration where the endpoint and data shape are already clear
  - Debugging a localized bug
  - Adding focused tests or fixing straightforward TypeScript errors
- Use a stronger/high-reasoning model for risky or complex work:
  - Auth/session/token behavior
  - Permission boundaries between patient, staff, and admin views
  - Patient data privacy, document access, billing, messages, or health data exposure
  - Multi-file refactors or shared state changes
  - Ambiguous bugs where the root cause is unknown
  - Build/deploy workflow changes
  - Security-sensitive changes
  - PR reviews where missing a defect would be costly

Default policy:
- Start with a lower-cost model for exploration when the task is unclear.
- Escalate only when the code path is sensitive, the change spans multiple systems, or confidence drops.
- Do not use a high-reasoning model just to inspect files, run commands, format docs, or make obvious small edits.
- Do use a high-reasoning model before changing auth, permissions, patient-data access, deployment, or broad architecture.

## Rules
- Work only inside this repository unless the user explicitly asks otherwise.
- Do not modify backend, server deployment, or external API behavior unless explicitly requested.
- Follow existing component, page, hook, context, and lib patterns.
- Follow the existing styling system in `client/src/index.css`, `client/src/components/ui`, Tailwind classes, and Radix UI patterns.
- Do not hardcode API responses or patient data that should come from the backend.
- Never commit secrets, tokens, credentials, real patient data, or private health information.
- Preserve existing auth/session behavior, including token storage, guarded routes, and 401 handling.
- Treat patient data, documents, messages, notes, and billing information as sensitive.
- Keep UI responsive across mobile and desktop.
- Handle loading, error, empty, and unauthorized states for user-facing workflows.
- Avoid unrelated redesigns or broad refactors unless the user asks for them.
- Do not bypass permission checks or expose staff/admin-only flows to patients.
- Prefer small, reviewable changes on a feature branch.

## Project Facts
- GitHub repo: `mosetayesh/PatientPortal-frontend`
- Remote: `git@github.com:mosetayesh/PatientPortal-frontend.git`
- Main branch: `main`
- Local dev command: `corepack pnpm run dev`
- Local dev URL: `http://localhost:3000/`
- Install command: `corepack pnpm install`
- Type check command: `corepack pnpm run check`
- Build command: `corepack pnpm run build`
- Default API base URL fallback: `https://adm.advantagehcs.com/api`
- Vite env variables currently referenced:
  - `VITE_API_BASE_URL`
  - `VITE_OAUTH_PORTAL_URL`
  - `VITE_APP_ID`
  - `VITE_FRONTEND_FORGE_API_KEY`
  - `VITE_FRONTEND_FORGE_API_URL`
  - `VITE_ANALYTICS_ENDPOINT`
  - `VITE_ANALYTICS_WEBSITE_ID`

## Before Coding
Always identify:
- Patient, staff, or admin screens affected
- Components, hooks, contexts, and API helpers affected
- API endpoints used or changed
- Expected request and response data shape
- Authentication and permission requirements
- Form validation requirements
- Loading, error, empty, and unauthorized states
- Mobile and desktop behavior
- Risk of exposing sensitive patient or staff data

## Task Handling
- Small tasks: make the minimal safe change directly.
- Medium tasks: give a short plan, then implement.
- Risky tasks: give a CTO-style plan first and wait for approval.
- UI tasks: preserve existing design patterns, responsive behavior, loading states, empty states, and error handling.
- API tasks: identify endpoints, request data, response data, auth requirements, and failure states before editing.
- Auth/session tasks: preserve token handling, guarded routes, logout behavior, and 401 handling unless the user explicitly asks for a change.

## Testing
Run the most relevant available commands before finishing:
- `corepack pnpm run check`
- `corepack pnpm run build`
- `corepack pnpm run dev` when visual verification is needed

When UI behavior changes, verify the affected flow in the browser when practical.

Current known setup note:
- `corepack pnpm run check` currently reports existing TypeScript errors in `client/src/contexts/AuthContext.tsx` and `client/src/pages/Documents.tsx`. Do not treat those as caused by unrelated changes unless your work touches them.

## Git Workflow
- Respect the developer's current branch.
- Pull from and push to the current working branch's upstream by default.
- Start from `main` only for new work when no feature branch is already selected, or when the user explicitly asks.
- Before any pull from `main`, tell the developer: "This will pull from `main`." Wait for confirmation.
- Before any push to `main`, tell the developer: "This will push to `main`." Wait for confirmation.
- Create feature branches for changes: `git checkout -b <descriptive-branch>`.
- Commit only intentional files.
- Do not revert user changes or unrelated work.
- Push feature branches to GitHub and open pull requests when requested.
- Pushing to `main` triggers the production deploy workflow in `.github/workflows/deploy.yml`; do not push directly to `main` unless the user explicitly asks.

## Output Required
When finished, provide:
- Files changed
- Screens or workflows changed
- API dependencies
- Auth/permission considerations
- Build/test results
- Risks or follow-up notes
- Git branch, commit, push, or PR details when applicable

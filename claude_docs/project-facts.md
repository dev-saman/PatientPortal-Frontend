---
name: project-facts
description: "Repo, branches, deploy pipeline, env vars, and commands — with corrections to stale AGENTS.md facts"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

**Repo & remote (current, verified 2026-07-02):** `origin = https://github.com/dev-saman/PatientPortal-Frontend.git`. Branches: `main` and `staging`; active dev branch is **`staging`**.
> ⚠️ `AGENTS.md` states the repo is `mosetayesh/PatientPortal-frontend` and describes a `main`→`deploy.yml` production deploy. Those are **stale** — trust the live git remote and `.github/workflows/` over AGENTS.md.

**CI/CD:** the only workflow is `.github/workflows/deploy-staging.yml` — **push to `staging` auto-deploys to Cloudways** via SSH+rsync (uploads `dist/public/` to `/home/master/applications/rxtdnqswpd/public_html`, concurrency-cancel-in-progress). CI uses Node 22 + pnpm (corepack) + `pnpm install --frozen-lockfile` + `pnpm run build`. There is no separate lint/test step in CI. Do not push to `staging` casually — it deploys.

**Commands:** dev `pnpm run dev` (port 3000, `--host`); type-check `pnpm run check`; build `pnpm run build` (vite build → `dist/public`, plus esbuild bundling `server/index.ts` → `dist`); format `pnpm run format`. Prod start `pnpm run start` (`NODE_ENV=production node dist/index.js`). Use `corepack pnpm ...` if pnpm isn't on PATH.

**Env vars** (Vite `import.meta.env`, no `.env` committed):
- `VITE_API_BASE_URL` — backend API base; fallback `https://adm.advantagehcs.com/api`.
- `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` — used by `getLoginUrl()` in `client/src/const.ts` (OAuth portal deep-link).
- Also referenced per AGENTS.md: `VITE_FRONTEND_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID`.

**PDF merge endpoint** `/api/merge-pdfs` (POST `{pdfUrls: string[]}` → merged `application/pdf`): served by a Vite dev-middleware plugin in `vite.config.ts` during dev, and by `server/index.ts` (Express) in production. Uses `pdf-merger-js`. Only HTTP(S) URLs; skips ones that fail, 502 if none merge.

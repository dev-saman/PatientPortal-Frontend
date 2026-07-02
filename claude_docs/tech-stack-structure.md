---
name: tech-stack-structure
description: "Tech stack, monorepo layout, path aliases, build tooling, and UI component system"
metadata: 
  node_type: memory
  type: project
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

**Stack:** React 19 + TypeScript 5.6 (strict) + Vite 7. Package manager is **pnpm** (via corepack); a `pnpm-lock.yaml` is authoritative. Routing via **wouter** (not react-router; wouter is patched — see `patches/wouter@3.7.1.patch`). Server state via **@tanstack/react-query**. HTTP via **axios**. Forms via **react-hook-form** + **zod**. Styling via **Tailwind CSS v4** (`@tailwindcss/vite`) + **Radix UI** primitives + **shadcn/ui** "new-york" style (57 components in `client/src/components/ui/`). Icons: lucide-react. Toasts: both the shadcn `useToast`/Toaster AND `sonner` are wired up in App.tsx.

**Monorepo layout** (single package.json at root):
- `client/` — the Vite root (`root: client`), all app code in `client/src/`.
- `server/` — `server/index.ts`, a minimal Express production server that serves the built SPA and hosts the `/api/merge-pdfs` PDF-merge endpoint. In dev the same merge endpoint is provided by a Vite middleware plugin in `vite.config.ts`.
- `shared/` — `shared/const.ts` (COOKIE_NAME, ONE_YEAR_MS).

**Path aliases** (`tsconfig.json` + `vite.config.ts`): `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets` → `attached_assets`. Use these, never long relative paths.

`client/src/` subfolders: `pages/` (+ `pages/admin/`), `components/` (+ `components/ui/`), `contexts/`, `hooks/`, `lib/` (API + utilities).

**Commands:** dev `pnpm run dev` (Vite, port 3000, `--host`); type-check `pnpm run check` (`tsc --noEmit`); build `pnpm run build` (vite build + esbuild bundles server); format `pnpm run format` (prettier). See [[project-facts]].

export const MAGIC_LINK_PENDING_REDIRECT_KEY = "ahcs_magic_link_pending_redirect";

/**
 * Ephemeral sessionStorage key that holds the case_id extracted directly from
 * the URL at the moment EmailLinkHandler processes the link. It is written
 * immediately — before the verify-API call and before any login redirect —
 * so the value is available even if the primary pending-redirect flow is
 * cleared or consumed by a different code path.
 *
 * Consumed (read + removed) once during the post-login redirect in
 * AuthContext.login(), acting as a last-resort fallback.
 */
export const URL_CASE_ID_KEY = "ahcs_url_case_id";

export interface MagicLinkPendingRedirect {
  form: string;
  path: string;
  encodedSearch: string;
  caseId?: string;
  patientId?: string;
}

export function getValidFormId(formValue: string | null | undefined): string | null {
  if (!formValue) return null;
  if (!/^\d+$/.test(formValue)) return null;
  // "0" is not a real form — treat as absent so callers fall back to "/"
  if (formValue === "0") return null;
  return formValue;
}

export function getFormPath(formValue: string | null | undefined): string | null {
  const validFormId = getValidFormId(formValue);
  if (!validFormId) return null;
  return `/form/${validFormId}`;
}

export function storePendingMagicLinkRedirect(formValue: string, encodedSearch: string, caseId?: string, patientId?: string): void {
  const path = getFormPath(formValue);
  if (!path) return;

  const payload: MagicLinkPendingRedirect = {
    form: formValue,
    path,
    encodedSearch,
    caseId: caseId || undefined,
    patientId: patientId || undefined,
  };

  sessionStorage.setItem(MAGIC_LINK_PENDING_REDIRECT_KEY, JSON.stringify(payload));
}

export function readPendingMagicLinkRedirect(): MagicLinkPendingRedirect | null {
  const raw = sessionStorage.getItem(MAGIC_LINK_PENDING_REDIRECT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MagicLinkPendingRedirect>;
    const validFormId = getValidFormId(parsed?.form);
    const validPath = getFormPath(parsed?.form);

    if (!validFormId || !validPath) return null;

    return {
      form: validFormId,
      path: validPath,
      encodedSearch: parsed?.encodedSearch ?? "",
      caseId: parsed?.caseId ? String(parsed.caseId) : undefined,
      patientId: parsed?.patientId ? String(parsed.patientId) : undefined,
    };
  } catch {
    return null;
  }
}

export function consumePendingMagicLinkRedirect(): MagicLinkPendingRedirect | null {
  const pending = readPendingMagicLinkRedirect();
  sessionStorage.removeItem(MAGIC_LINK_PENDING_REDIRECT_KEY);
  return pending;
}

export function consumePendingMagicLinkRedirectPath(): string | null {
  const pending = consumePendingMagicLinkRedirect();
  return pending?.path ?? null;
}

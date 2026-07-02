export function getApiErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const err = error as any;
    return (
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.data?.message ||
      err?.data?.error ||
      err?.message ||
      ""
    );
  }

  return "";
}

import Apis from "@/lib/Apis";

/**
 * Resolve the funnel id for the currently selected case.
 *
 * `getPatientFunnels()` is scoped to the active case via the `?case_id` query
 * param (see the api.ts request interceptor), so this MUST be called only after
 * the selected case has actually changed in localStorage, otherwise it resolves
 * against the old case.
 *
 * Returns the first funnel's id as a string, or null when the case has no funnel.
 */
export async function resolveCurrentCaseFunnelId(): Promise<string | null> {
  const funnelsResponse = await Apis.getPatientFunnels();

  const funnelCandidates = [
    funnelsResponse,
    funnelsResponse?.data,
    funnelsResponse?.data?.data,
    funnelsResponse?.funnels,
    funnelsResponse?.funnel,
    funnelsResponse?.patient_funnels,
    funnelsResponse?.data?.funnels,
    funnelsResponse?.data?.funnel,
    funnelsResponse?.data?.patient_funnels,
    funnelsResponse?.data?.data?.funnels,
    funnelsResponse?.data?.data?.funnel,
    funnelsResponse?.data?.data?.patient_funnels,
  ];

  const funnels = funnelCandidates.find((candidate) => Array.isArray(candidate));
  const firstFunnel = Array.isArray(funnels) ? funnels[0] : null;
  if (!firstFunnel) return null;

  const funnelId = firstFunnel?.id ?? firstFunnel?.funnel_id;
  if (funnelId === undefined || funnelId === null || funnelId === "") return null;

  return String(funnelId);
}

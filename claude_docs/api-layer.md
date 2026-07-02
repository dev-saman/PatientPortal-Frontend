---
name: api-layer
description: "The API layer — Apis static class, Network() helper, and the axios instance/interceptors"
metadata: 
  node_type: memory
  type: project
  originSessionId: 75adad51-7a9f-4d48-ae93-ece92d06f5dd
---

Three layers in `client/src/lib/`, call them in this order top-down:

1. **`Apis.ts`** — `export default class Apis` with **static methods** per backend endpoint (e.g. `Apis.login(formData)`, `Apis.getPatientDetails()`, `Apis.getClinical()`, `Apis.rescheduleAppointment(...)`). This is the canonical place to add a new endpoint. Each method just calls `Network(...)`. Add new API calls here, don't scatter axios calls in components.

2. **`network.ts`** — `Network<T>(method, endpoint, data?, isMultipart?, requestConfig?)`. GET puts `data` on `params`, other methods on `data`. Returns `response.data` only. On error it logs and **throws `error.response?.data` (the raw backend body), not the AxiosError** — so component catch blocks receive the backend JSON. Use `getApiErrorMessage()` (`lib/apiError.ts`) to extract a message. Also exports `get/post/put/del/patch` convenience wrappers and an `ApiResponse<T>` type (`{success, data?, message?, error?}`). Backend responses use a `success: boolean` flag.

3. **`api.ts`** — the singleton **axios instance**. baseURL = `VITE_API_BASE_URL || https://adm.advantagehcs.com/api`, 30s timeout. **Request interceptor** attaches `Authorization: Bearer <ahcs_token>`, auto-injects `?case_id=` for non-exempt endpoints (see [[case-scoping]]), and deletes `Content-Type` when body is FormData (so the multipart boundary is set correctly). **Response interceptor** handles global 401 (see [[auth-session-model]]).

FormData/multipart calls pass `isMultipart=true` and must NOT set `Content-Type` manually. Binary downloads pass `{ responseType: "blob" }` via requestConfig (e.g. clinical PDFs, form PDFs).

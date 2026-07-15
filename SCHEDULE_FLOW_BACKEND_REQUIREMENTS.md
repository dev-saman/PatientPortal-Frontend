# Backend Requirements — Patient Portal Scheduling Flow

**Audience:** Backend developer (Laravel API)
**Requested by:** Frontend (Patient Portal / web) — also consumed later by the mobile app
**Status:** Frontend implementation of Steps 4.1, 5.1, 5.2 is **BLOCKED** pending the items below.

> **Ground rules for this document**
> - The frontend is a **thin UI layer**: it only calls APIs, displays returned data, handles UI interaction, and shows loading/error/success states.
> - The frontend will **not** implement business logic, validation, field mappings, default values, or status values. All of that must live in the backend so web and mobile share one source of truth.
> - Any JSON marked **"Requested / expected shape"** below is a statement of what the frontend *needs*, **not** an assumption about current behavior. Please confirm or correct exact field names, types, and nesting.

---

## Flow overview & current status

| # | Feature | Endpoint | Status |
|---|---------|----------|--------|
| 1 | Get approved preauth | `GET get-approved-preauth` | ✅ Working |
| 2 | Notify preauth missing details | `POST notify-patient-preauth-missing-details?case_id=&ma_id=` | ✅ Working |
| 3.1 | Check sessions completed | `GET check-sessions-completed?case_id=&ma_id=` | ✅ Working |
| 3.2 | Get time slots date range | `GET get-time-slots-date-range?...` | ✅ Working |
| 3.2.1 | Get available time | `GET available-time-slots?...` | ✅ Working |
| **4.1** | **Get patient info (transport)** | `GET get-patient-info?case_id=` | ⛔ **Blocked** — response undefined |
| **5.1** | **Schedule (booking)** | `POST appointment-schedule/{user}/{case_id}/{ma_id}/{patient_id}` | ⛔ **Blocked** — response undefined, field sources unconfirmed, `patient_id` source unknown |
| **5.2** | **Update transport** | `POST update-transport?case_id=&appt_id=` | ⛔ **Blocked** — response undefined, field sources & workflow undefined |

---

# BR-1 — `appointment-schedule` response is undefined

**Feature Name:** Appointment booking (Step 5.1)

**Current API:**
`POST /appointment-schedule/{user_name}/{case_id}/{ma_id}/{patient_id}` (Content-Type `application/json`)

Observed request body (from provided curl):
```json
{
  "department": "Fort Worth",
  "service": "DC",
  "attend_type": "IR",
  "pa_req": "IR",
  "attend_status": "S",
  "physicanId": 7140,
  "physicanName": "Scott Jones, DC",
  "attend_date": "2026-07-01",
  "svc_date_start": "2026-07-01",
  "svc_date_end": "2026-07-29",
  "time": "08:30",
  "end_time": "08:45",
  "status": "Approved",
  "pa_resp": "Approved",
  "no_sessions": 1,
  "provider_code": "SJFT1",
  "company_name": "(NTXRC) North Texas rehabilition center",
  "is_patient_portal": 1
}
```

**Issue / Blocker:** No documented/sample **response** for this endpoint. In particular, the created appointment's `appt_id` is not known.

**Why the frontend cannot proceed:** Step 5.2 (`update-transport`) requires `appt_id` as a query param. Without knowing the exact response field that carries the booked `appt_id`, the transport/virtual step cannot be chained after booking. The frontend also needs a success flag and a user-facing message to show success/error states.

**Required backend changes:** Document and return a stable JSON response from `appointment-schedule`, including the created appointment identifier(s).

**Required request parameters:** (confirmation only — see BR-4 for per-field sources.)

**Required response fields (minimum the frontend needs):**
- `success` (boolean)
- `message` (string — user-facing success/error text)
- `appt_id` (the created appointment id used by `update-transport`)
- Echo of the scheduled `attend_date`, `time`, `end_time`, `status` (to display the confirmed slot)

**Expected response sample (JSON) — requested shape, please confirm exact names:**
```json
{
  "success": true,
  "message": "Appointment scheduled successfully.",
  "data": {
    "appt_id": 693183,
    "attend_date": "2026-07-01",
    "time": "08:30",
    "end_time": "08:45",
    "status": "S"
  }
}
```
Error shape (requested):
```json
{ "success": false, "message": "<reason>" }
```

**Required validation/business logic (backend-owned):**
- Validate the slot is still available at booking time (avoid double-booking).
- Enforce remaining-sessions / preauth validity.
- Confirm whether **one request books exactly one appointment** (returns one `appt_id`). The frontend intends to call this **once per selected slot**; please confirm this is correct rather than a batch call.

**Priority:** **High**

---

# BR-2 — `get-patient-info` response is undefined

**Feature Name:** Patient/transport info (Step 4.1)

**Current API:** `GET /get-patient-info?case_id={case_id}`

**Issue / Blocker:** No documented/sample response. Unknown which fields prefill the transport form and whether it exposes `patient_id`.

**Why the frontend cannot proceed:** The transport payload (BR-5) requires address, phone, and driver fields that presumably come from this endpoint. Without the exact field names, the frontend cannot display or prefill anything, and cannot map values into `update-transport`.

**Required backend changes:** Document and return a stable JSON response.

**Required request parameters:**
- `case_id` (confirm this is the **preauth's** case_id).

**Required response fields (minimum):**
- The fields that populate the transport form: pickup address line, city, state, zip, phone, cell, and any driver defaults.
- `patient_id` **if** this endpoint is the intended source for the schedule path (see BR-3).
- A `success` flag and `message` for error handling.

**Expected response sample (JSON) — requested shape, please confirm exact names & which map to transport fields:**
```json
{
  "success": true,
  "data": {
    "patient_id": 10004619,
    "pu_address1": "123 Main St",
    "pu_city": "Los Angeles",
    "pu_state": "KS",
    "pu_zip": "90002",
    "pu_phone": "506-300-5042",
    "pu_cell": "639-395-0833",
    "pu_driver": "",
    "do_driver": ""
  }
}
```

**Required validation/business logic (backend-owned):** Return values scoped to the given case/patient; the frontend performs no computation on them.

**Priority:** **High**

---

# BR-3 — Source of `patient_id` (schedule path segment)

**Feature Name:** Appointment booking path parameter (Step 5.1)

**Current API:** `POST /appointment-schedule/{user_name}/{case_id}/{ma_id}/{patient_id}`
Observed path: `/appointment-schedule/test13 Madison Riley testmh1/10005871/185797/10004619`

**Issue / Blocker:** `patient_id` (`10004619`) is **not present** on the `get-approved-preauth` record the frontend holds. Its authoritative source is unknown.

**Why the frontend cannot proceed:** The booking URL cannot be constructed without a confirmed source for `patient_id`. The frontend will not guess it (e.g. from the JWT `patient_id`, which may not match the selected case).

**Required backend changes:** Specify exactly where `patient_id` comes from, one of:
- Returned by `get-patient-info?case_id=` (preferred — already case-scoped), or
- Added as a field on each `get-approved-preauth` record, or
- Another documented source.

**Required request parameters:** N/A (this is a source-of-truth question).

**Required response fields:** `patient_id` on whichever endpoint is designated the source (BR-2 or BR-1's upstream data).

**Expected response sample (JSON):** see BR-2 (`patient_id` included).

**Required validation/business logic (backend-owned):** `patient_id` must correspond to the selected `case_id`.

**Priority:** **High**

---

# BR-4 — Confirm every `appointment-schedule` payload field and its backend source

**Feature Name:** Booking payload field mapping (Step 5.1)

**Current API:** `POST appointment-schedule/...` (body above).

**Issue / Blocker:** The frontend must not map or default any field. For each body field we need the **authoritative source** confirmed. Below, "FE candidate" is the value the frontend *can* supply from an existing API/state — **please confirm each is correct, or specify the real source**. Fields with no clear source are flagged.

| Payload field | Example | FE candidate source (confirm or correct) |
|---|---|---|
| `department` | `"Fort Worth"` | Location **name** vs **id** from `get-appointment-departments` — **which one?** |
| `service` | `"DC"` | Selected speciality `short_name` from `get-department-speciality-with-physician` — confirm |
| `attend_type` | `"IR"` | Visit-type `visittype_code` from same API — confirm |
| `pa_req` | `"IR"` | `pa_req` from `get-approved-preauth` — confirm |
| `attend_status` | `"S"` | **Unknown** — fixed constant `"S"`? Or from an API? Provide allowed values |
| `physicanId` | `7140` | `physician_id` of selected provider — confirm |
| `physicanName` | `"Scott Jones, DC"` | `physician_name` of selected provider — confirm |
| `attend_date` | `"2026-07-01"` | Selected slot date — confirm format |
| `svc_date_start` | `"2026-07-01"` | Preauth `svc_date_start` — confirm |
| `svc_date_end` | `"2026-07-29"` | Preauth `svc_date_end` — does `ext_date` ever override? |
| `time` / `end_time` | `"08:30"` / `"08:45"` | Selected slot start/end — confirm format |
| `status` | `"Approved"` | Preauth `status` — confirm |
| `pa_resp` | `"Approved"` | Preauth `pa_resp` — confirm |
| `no_sessions` | `1` | **Unknown** — always 1 per appointment, or computed? |
| `provider_code` | `"SJFT1"` | `amd_code` from `get-company-by-department-and-provider` — confirm |
| `company_name` | `"(NTXRC) ..."` | `amd_company_name` from same API — confirm |
| `is_patient_portal` | `1` | Fixed constant `1`? — confirm |
| `{user_name}` (path) | `"test13 Madison Riley testmh1"` | Auth `user.name` — confirm exact value, spaces, encoding |

**Why the frontend cannot proceed:** Sending an unconfirmed/mismapped field (e.g. `attend_status`, `no_sessions`, `department` id-vs-name) risks incorrect bookings. These are business values the backend owns.

**Required backend changes:** Provide a field-by-field mapping table stating, for each payload field, the exact upstream API + response field (or "fixed constant = X", or "derived by backend — remove from request").
> If any of these values can be **derived server-side** from `case_id`/`ma_id`/provider/slot, please move that logic to the backend and drop the field from the request. The frontend should send the minimum identifiers only.

**Required request parameters:** the confirmed, minimal set after the review above.

**Required response fields:** see BR-1.

**Required validation/business logic (backend-owned):** allowed values for `attend_status`, `attend_type`, `status`, `pa_resp`; session counting for `no_sessions`.

**Priority:** **High**

---

# BR-5 — Transport workflow requirements

**Feature Name:** Transport request per appointment (Step 5.2, transport mode)

**Current API:** `POST /update-transport?case_id={case_id}&appt_id={appt_id}` (Content-Type `application/json`)

Observed transport payload:
```json
{
  "pu_address1": "123 Main St132",
  "pu_city": "Los Angeles",
  "pu_state": "KS",
  "pu_zip": "90002-13",
  "pu_phone": "506-300-5042",
  "pu_cell": "639-395-0833",
  "pick_up_time": "08:00 AM",
  "drop_off_time": "08:15 AM",
  "transport": 1,
  "pu_driver": "test",
  "do_driver": "test",
  "user": "test13 Madison Riley testmh1"
}
```

**Issue / Blocker:** Field sources, editability, formats, and the trigger workflow are undefined; the response is undefined.

**Why the frontend cannot proceed:** The frontend cannot decide (a) which fields are prefilled vs. patient-entered, (b) time formats, (c) how `appt_id` and `case_id` are obtained, or (d) success/error handling — these are product/business rules that must be defined by the backend/product, not assumed.

**Required backend changes / clarifications:**
- `appt_id` comes from the `appointment-schedule` response (BR-1) — confirm.
- `case_id` here = the **preauth's** case_id — confirm.
- For **each** field, specify: source (`get-patient-info` field name / patient-entered / fixed) **and** whether the patient may edit it in the UI.
- `pick_up_time` / `drop_off_time`: patient-entered or derived from appointment time? Expected format `"08:00 AM"` differs from slot times `"08:30"` — confirm required format & source.
- `pu_driver` / `do_driver`: source (default from `get-patient-info`, patient-entered, or fixed)?
- `user`: confirm = same `{user_name}` as the schedule path.
- Confirm the flag combination for transport: `transport: 1` (and `is_virtual` omitted/0).
- Confirm it is called **once per appointment** that selects transport.

**Required request parameters:** `case_id`, `appt_id` (query) + confirmed body per above.

**Required response fields:** `success` (boolean), `message` (string).

---

# BR-6 — `get-approved-preauth` must return per-record session counts

**Feature Name:** Sessions badge on the Select Preauthorization card (`4/12` completed/total + "Remaining Sessions" tooltip)

**Current API:** `GET /get-approved-preauth` (case_id auto-injected)

**Issue / Blocker:** Each preauth card should display a small badge with **completed / total** sessions and a hover tooltip showing **sessions still available**. These are usage counts the backend owns; the frontend must not compute them. The current `get-approved-preauth` response does **not** include any session-count fields, so the badge cannot render from the single call that populates the card.

**Requested / expected shape:** add the following fields to **each record** in the `data[]` array:

| Field | Type | Meaning | Source (already computed in `checkSessionsCompleted`) |
|---|---|---|---|
| `no_sessions` | int | Total authorized sessions | `ahcs_med_auths.no_sessions` (currently only used in the `> 0` filter, not returned) |
| `sessions_completed` | int | Completed / used sessions | count of `ahcs_attendances` for the `ma_id` where `attend_status IN ('Check In','1')` and `attend_date` is not null |
| `sessions_remaining` | int | Sessions still available | `max(0, no_sessions - sessions_completed - scheduled)` |

**Why the frontend cannot proceed (with real data):** The badge is a pure field-read. The frontend renders it only when these numeric fields are present, so the UI degrades gracefully (badge simply absent) until the backend ships them — but it shows nothing meaningful until then.

**Reuse note:** The completed-count logic already exists in `PreauthController@getApprovedPreauth` (`app/Http/Controllers/Api/PreauthController.php`, ~lines 210–218) but is **commented out**, and the response builder (~lines 244–261) does not select these fields. `checkSessionsCompleted` (~lines 307–336) already returns all three (`no_sessions`, `sessions_completed`, `sessions_remaining`), so the same logic can be reused verbatim in `getApprovedPreauth`.

**Required response fields:** `no_sessions`, `sessions_completed`, `sessions_remaining` on every `data[]` record.

**Status update:** ✅ **Partially delivered.** `get-approved-preauth` now returns `no_sessions` and `sessions_remaining` per record. **`sessions_completed` is still missing.**

Because of that, the frontend derives the badge's numerator as `used = no_sessions - sessions_remaining`. Since the backend's `sessions_remaining` subtracts **both** completed *and* future-scheduled sessions, this derived "used" actually means **completed + scheduled**, not completed alone. That is acceptable for the current badge, but if the badge must show *completed only*, the backend needs to add `sessions_completed` (the logic already exists in `checkSessionsCompleted`). Until then the two numbers cannot be distinguished client-side.

**Priority:** **Medium** (remaining item: add `sessions_completed`)

**Expected response sample (JSON) — requested shape:**
```json
{ "success": true, "message": "Transport details saved." }
```

**Required validation/business logic (backend-owned):** validate address/phone/time formats server-side; associate transport with the given `appt_id`.

**Priority:** **Medium** (depends on BR-1)

---

# BR-6 — Virtual appointment workflow requirements

**Feature Name:** Virtual request per appointment (Step 5.2, virtual mode)

**Current API:** `POST /update-transport?case_id={case_id}&appt_id={appt_id}`

Observed virtual payload (from comments in provided example):
```json
{ "is_virtual": 1, "transport": 0, "user": "<user_name>" }
```

**Issue / Blocker:** Exact required fields and behavior for virtual are undefined.

**Why the frontend cannot proceed:** The frontend must not assume that virtual requires no other fields, nor the exact flag values.

**Required backend changes / clarifications:**
- Confirm the exact required body for virtual: `is_virtual: 1`, `transport: 0`, `user`, and **nothing else**?
- Confirm virtual and transport are **mutually exclusive per appointment**.
- Confirm same endpoint + query params (`case_id`, `appt_id`) as BR-5.
- Confirm it is called **once per appointment** that selects virtual.

**Required request parameters:** `case_id`, `appt_id` (query) + confirmed virtual body.

**Required response fields:** `success` (boolean), `message` (string).

**Expected response sample (JSON) — requested shape:**
```json
{ "success": true, "message": "Marked as virtual appointment." }
```

**Required validation/business logic (backend-owned):** enforce mutual exclusivity of transport vs. virtual for a given `appt_id`.

**Priority:** **Medium** (depends on BR-1)

---

# BR-7 — SAVE sequence / batch behavior across multiple appointments

**Feature Name:** Multi-appointment submit orchestration (Steps 5.1 + 5.2)

**Current API:** `appointment-schedule` + `update-transport` (per above).

**Issue / Blocker:** When the patient selects multiple slots, the ordering, per-item chaining, and failure handling are not defined by the APIs.

**Why the frontend cannot proceed:** The frontend needs the backend/product to define the intended orchestration so it can correctly report per-appointment success/error without inventing rules.

**Required backend changes / clarifications:**
- Confirm intended sequence: **for each selected slot** → call `appointment-schedule` → obtain that slot's `appt_id` → **if** transport/virtual selected for that slot, call `update-transport` with that `appt_id`.
- Confirm each call is **independent** (its own response and scheduled time), per the stated requirement.
- Define failure handling: if one slot's booking (or its transport) fails, should the remaining slots **continue** or the batch **stop**? Should a failed transport roll back its booking?
- Is there any **bulk** endpoint the backend prefers instead of N individual calls? (If yes, provide its contract; otherwise the frontend loops per slot as above.)

**Required request parameters / response fields:** as per BR-1, BR-5, BR-6.

**Required validation/business logic (backend-owned):** idempotency / double-submit protection for repeated SAVE clicks.

**Priority:** **Medium**

---

# BR-8 — Any additional APIs or response fields needed

**Feature Name:** Gaps discovered during audit

**Issue / Blocker:** A few values needed by the flow have no confirmed source.

**Required backend changes / clarifications:**
- **`patient_id`** exposure (see BR-3) — highest-impact gap.
- **Allowed value lists** (enums) for `attend_status`, `attend_type`, `status`, `pa_resp` — so the backend, not the frontend, owns valid values.
- **`appt_id` echo** in the `appointment-schedule` response (see BR-1) — without it Step 5.2 is impossible.
- Confirm whether `get-time-slots-date-range` / `available-time-slots` already return everything needed for `time` / `end_time` in the exact format `appointment-schedule` expects (avoid frontend reformatting). If a format conversion is needed, please have the API return it in the final expected format.
- Confirm whether any transport defaults beyond `get-patient-info` (e.g. saved prior transport for the case) should be returned.

**Required response fields:** `patient_id`; enum lists; `appt_id`.

**Priority:** **High** (for `patient_id` and `appt_id`), **Medium** (enums/formats)

---

# BR-9 — `get-time-slots-date-range` must return provider-**unavailable** days (don't drop them)

**Feature Name:** "Not Available (N/A)" column in the Schedule Remaining Appointments grid

**Current API:** `GET /get-time-slots-date-range?...`

**Issue / Blocker:** When the provider is **not available for a whole working day** (e.g. an
approved **all-day absence**, or a scheduled weekday with no open/close), the endpoint **omits that
date entirely** from `dates[]` — `PhysicanController@getTimeSlotsForDateRange` hits `continue`
before pushing the day (all-day absence: ~line 6261; not-scheduled weekday: ~6225; no open/close:
~6240; monthly no-availability: ~6215). Because the date never appears in the response, the thin
frontend has **no column to render** for it.

**Why the frontend cannot proceed:** The reference (legacy Medhiwa) UI shows such a day as a full
column of **"⚠ N/A"** cells while still showing the provider's **Lunch** rows (see the reference
screenshot). The legacy screen produces this by computing the weekly grid **client-side** and
overlaying absences from separate endpoints — exactly the business logic this frontend must not
duplicate. To reproduce the reference from a single API call, the endpoint must **include** the
unavailable day in `dates[]` with slots the frontend can render by `type` (it already renders
`lunch`, `holiday`, `booked`, `blocked`, `available` this way). The frontend does **not** infer
availability, generate slot times, or reconstruct the schedule.

**Required backend changes:** For a working day on which the provider is **not available**, still
push the day into `dates[]` (do **not** `continue`). Generate the normal 15-minute slot loop across
the configured open→close window, but mark the **working-hour** slots with a new
`type: "not_available"` (`disabled: true`), while **still emitting** the existing `lunch` (and
`holiday`) slots at their times. Weekends may continue to be omitted as today. This makes the N/A
column render identically to the reference (N/A on working rows, Lunch on lunch rows) with **zero**
frontend logic.

**Required request parameters:** unchanged (same as the existing endpoint).

**Required response fields (per unavailable day in `dates[]`):**
- `date`, `day_name`, `is_holiday`, `holiday_name` — same as available days.
- `slots[]` where each working-hour slot is `{ time, is_lunch: false, type: "not_available", disabled: true }`, lunch slots remain `type: "lunch"`, holidays remain `type: "holiday"`.
- Optionally a day-level `is_available: false` for clarity (not required by the frontend — it renders off the slot `type`).

**Expected response sample (JSON) — requested shape, please confirm exact names/values:**
```json
{
  "date": "2026-07-14",
  "day_name": "Tuesday",
  "is_holiday": false,
  "holiday_name": null,
  "is_available": false,
  "slots": [
    { "time": "08:00 AM", "is_lunch": false, "type": "not_available", "disabled": true },
    { "time": "08:15 AM", "is_lunch": false, "type": "not_available", "disabled": true },
    { "time": "12:00 PM", "is_lunch": true,  "type": "lunch",         "disabled": true }
  ]
}
```

**Required validation/business logic (backend-owned):** the backend decides availability
(schedule + absences); the frontend only reads `type`. A `"not_available"` slot must never be
bookable.

**Frontend status:** ✅ **Ready.** The grid already renders `type: "not_available"` (and
`"unavailable"`) as a disabled **"⚠ N/A"** cell, keeps `lunch` rows as **Lunch**, and shows a
"Provider not available for the selected days" placeholder if an entire page has no availability. It
also renders any day returned with an **empty** `slots: []` as an all-N/A column. Until the backend
includes these days, the columns simply don't appear (graceful — no broken/empty column).

**Priority:** **Medium**

---

# BR-10 — Identify the patient's OWN appointment + prevent duplicate visit-type/day booking

**Feature Name:** "One appointment per visit type per day" — notify, auto-select the existing one,
and disable the rest of that day's slots

**Current API:** `GET /get-time-slots-date-range?...&case_id=&visit_type=&service=` (add `patient_id`
per **BR-3**)

**Issue / Blocker:** The response cannot tell the frontend that the patient **already has** an
appointment of the selected visit type on a given date:
- Booked slots are anonymized — a slot only carries `type:"booked"` (deliberately shown as "Not
  Available"); it does **not** identify **whose** appointment it is or **which visit type** occupies
  it.
- The backend builds its booked set **by provider + date only** (`ahcs_attendances.provider_id` +
  `attend_date`; `PhysicanController@getTimeSlotsForDateRange`, ~lines 6134–6146) — there is **no
  patient/case/ma filter**, so it cannot mark "this is the current patient's booking."
- "Same visit type" is a backend-owned match (visit-type name/code aliases via
  `resolveVisitTypeCapacityContext`, ~lines 5079–5132). The frontend must not reimplement that.

**Why the frontend cannot proceed:** To (a) notify the patient, (b) auto-select/highlight the
existing appointment, and (c) disable the other slots for that date, the frontend needs the backend
to say, per date, "the patient already has a `visit_type` appointment here, at this time window."
It cannot derive owner or visit type from the current anonymized `booked` slots, and cross-matching
a separate appointments list against backend visit-type aliases would be business logic the frontend
must not own.

**Required backend changes:** Since `get-time-slots-date-range` already receives `case_id` +
`visit_type` (and `patient_id` per BR-3), have it flag, per date, whether the patient already holds
an appointment of that visit type, and return that appointment's window so the frontend can select
and lock it. Two equivalent shapes (please pick one):
- **Per-date object** — add `existing_appointment` to each `dates[]` entry:
  `{ appt_id, start: "10:00 AM", end: "11:00 AM", visittype_code }` (null when none), **plus** a
  day-level `booking_locked: true` when an existing same-visit-type appointment makes the whole day
  ineligible for another booking.
- **Per-slot flags** — on the occupied slot(s): `is_own_appointment: true`, `own_appt_id`,
  and the day-level `booking_locked: true`.

**Required response fields (minimum):** per date — a way to (1) detect the existing same-visit-type
appointment, (2) know its start/end window (to highlight/auto-select), (3) know the day is locked so
the other slots render disabled.

**Expected response sample (JSON) — requested shape, please confirm names:**
```json
{
  "date": "2026-07-14",
  "day_name": "Tuesday",
  "booking_locked": true,
  "existing_appointment": { "appt_id": 693183, "start": "10:00 AM", "end": "11:00 AM", "visittype_code": "IC" },
  "slots": [ /* … existing shape … */ ]
}
```

**Required validation/business logic (backend-owned):** the backend decides "same visit type"
(aliases/codes) and enforces the one-per-visit-type-per-day rule on submit (`appointment-schedule`
should also reject a duplicate). The frontend only reads the flags to render/notify.

**Frontend plan once delivered:** show a "You already have an appointment on this date" modal
(Close icon + Close button), auto-select/highlight the `existing_appointment` window, and render the
day's remaining slots disabled while `booking_locked` is true.

**Priority:** **Medium** (depends on **BR-3** `patient_id`).

---

# BR-11 — Expose multi-appointment CAPACITY and the configured group WINDOW

**Feature Name:** Capacity-aware multi-appointment slots (show remaining capacity; enforce the
configured group window)

**Current API:** `GET /get-time-slots-date-range?...&visit_type=&service=`

**Issue / Blocker:** The backend computes capacity server-side (`$capacityCtx`:
`allow_multiple`, `allow_per_slot`, `type_aliases`; booked-check ~lines 6403–6434) but **serializes
none of it**. The response has no `allow_multiple`, `capacity`, `booked_count`, or `remaining` on any
slot, and slots are always emitted as individual **15-minute ticks** with **no window grouping** —
a group appointment's underlying booking is simply skipped, so its ticks come back as ordinary
`available` slots. The frontend therefore cannot:
- show how much capacity remains on a multi-appointment slot, or allow booking only within it; or
- know that, e.g., **10:00–11:00 AM** is a single configured group window that must be booked as a
  unit (Example 2: selecting an overlapping 9:30–10:30 must be rejected with a modal directing the
  user to the 10:00–11:00 slot).

**Why the frontend cannot proceed:** capacity numbers, the group-window bounds, and the
"must-align-to-window-start" rule are all backend-owned configuration. The frontend has only
anonymous 15-min available ticks.

**Required backend changes:** For a capacity-enabled visit type, expose the group window and its
capacity in the response. Preferred (simplest for a thin client): return the group window as **one
selectable slot** rather than 15-min ticks, e.g.:
```json
{
  "time": "10:00 AM",
  "end": "11:00 AM",
  "type": "available_multi",
  "allow_multiple": true,
  "capacity": 4,
  "booked_count": 2,
  "remaining": 2,
  "disabled": false
}
```
so the frontend renders "2 of 4 booked — 2 left", books the whole window, and never offers a
misaligned start. If ticks must stay 15-min, then instead tag each tick in the window with
`window_start:"10:00 AM"`, `window_end:"11:00 AM"`, `allow_multiple:true`, `capacity`, `remaining`
so the frontend can group them and require selection at `window_start`.

**Required response fields (minimum):** per multi-appointment slot/window — `allow_multiple`,
`capacity` (`allow_per_slot`), `booked_count` or `remaining`, and the window `start`/`end` (or
`window_start`/`window_end`).

**Required validation/business logic (backend-owned):** `appointment-schedule` must reject a booking
that (a) exceeds `remaining` capacity, or (b) does not align to the configured window
(Example 2). The frontend modal ("This appointment can only be booked in the 10:00–11:00 AM time
slot…") is UX only; the backend stays authoritative.

**Frontend plan once delivered:** display remaining capacity on the slot, allow selection while
`remaining > 0`, and if the patient picks a misaligned/overlapping slot show a modal (Close icon +
Close button) naming the correct window.

**Priority:** **Medium**

---

# BR-12 — Reschedule calendar needs per-date HOLIDAY / PROVIDER-LEAVE data (month range) for red highlighting + tooltip

**Feature Name:** Reschedule modal calendar — highlight provider absences and holidays in red with a
hover tooltip ("Holiday" / "Provider on Leave: <reason>"), like the reference screenshot.

**Current APIs:**
- `GET /available-time-slots?provider_id=&location=&service=&visit_type=&date=&case_id=&start_time=`
  — **single date only.** Returns `{ status, duration_minutes, start_times[], end_times[] }`; each
  time is `{ value:"HH:MM", label:"09:00 am (Booked)|(Lunch)", disabled, type }`. It has **no
  month/range view**, so it cannot tell the calendar which *days* are holidays or provider-leave.
- `GET /get-time-slots-date-range?...` — range-capable, but per **BR-9** it **omits** provider-
  unavailable days entirely (they never appear in `dates[]`), and in testing returned no
  `is_holiday`/`holiday_name` flags. So the frontend cannot know which future days are holidays or
  provider-on-leave, nor the reason text for a tooltip.

**Issue / Blocker:** The reschedule calendar (a month view) needs, for each date it renders, a flag
saying the day is a **holiday** or **provider-on-leave** plus a short **reason** string for the
tooltip. Neither current endpoint exposes this for a month at once. Deriving it client-side is not
possible: absent days are indistinguishable from weekends/no-data, and the frontend must not infer
provider schedules or absence reasons (backend-owned).

**Required backend changes (pick one):**
- **Preferred — a lightweight month/range availability-status endpoint**, e.g.
  `GET /provider-availability-calendar?provider_id=&location=&service=&visit_type=&date_start=&date_end=&case_id=`
  returning one entry per date with a status + reason:
  ```json
  {
    "status": true,
    "dates": [
      { "date": "2026-07-03", "status": "provider_leave", "reason": "Provider on Leave: Out" },
      { "date": "2026-07-04", "status": "holiday",         "reason": "Independence Day" },
      { "date": "2026-07-16", "status": "available",       "reason": null }
    ]
  }
  ```
  (`status` ∈ `available` | `holiday` | `provider_leave` | `fully_booked`; `reason` is the tooltip text.)
- **Or** extend `get-time-slots-date-range` per **BR-9** to **include** unavailable days with a
  day-level `is_available:false`, `is_holiday`, `holiday_name`, and an absence `reason` (e.g.
  "Provider on Leave: Out"), so the frontend can paint the day and show the tooltip from the same call.

**Frontend plan once delivered:** react-day-picker v9 `modifiers`/`modifiersClassNames` paint
holiday/leave days red, and a custom `DayButton` wraps each in a tooltip (reusing
`components/ui/tooltip.tsx`) showing the returned `reason`. Requirements #1–#4 (past-date disabling +
real `available-time-slots`-driven Start/End times) are already implemented; only this highlighting
step is blocked.

**Priority:** **Medium**

**Status update:** ⛔ **Frontend wired, but backend-blocked (verified).** The reschedule calendar is
fully coded to highlight holidays + all-day provider leave (red + hover tooltip) from the Medhiwa data
source, but the required routes are **not reachable from the patient API**:
- `GET /api/holidays` → **404** on `adm.advantagehcs.com` (the deployed `admin-panel` app). In the
  Medhiwa source it is also guarded by **`auth:sanctum`** (`routes/api.php`), which the patient portal's
  **JWT** (tymon/`auth:api`) cannot satisfy.
- `GET /api/vacations/calendar-blocks?date=` → **404** on the same deployment (defined in Medhiwa
  source with no middleware, but not present on the patient API).

The frontend degrades silently (no highlight, no error) and a circuit-breaker stops after one failed
probe so it does not fire a request-per-day storm. **Required:** expose these two reads on the patient
API, authenticated with the patient **JWT** (not Sanctum), returning: (a) holidays `{date, name}`; and
(b) for a provider, the all-day leave dates `{date, label}`. A single **provider + date-range**
endpoint (rather than per-date `calendar-blocks`) is strongly preferred to avoid ~30 calls per month.
Once shipped, the existing frontend activates automatically (no code change).

---

## Summary of blockers (quick list for triage)

| ID | Blocker | Priority |
|----|---------|----------|
| BR-1 | `appointment-schedule` response undefined (need `appt_id`, success, message) | High |
| BR-2 | `get-patient-info` response undefined | High |
| BR-3 | `patient_id` source unknown | High |
| BR-4 | Per-field source confirmation for schedule payload | High |
| BR-5 | Transport workflow (fields/editability/format/trigger/response) undefined | Medium |
| BR-6 | Virtual workflow (exact body/flags) undefined | Medium |
| BR-7 | Multi-appointment SAVE orchestration & failure handling undefined | Medium |
| BR-8 | `patient_id` exposure, enum value lists, `appt_id` echo, time-format guarantees | High/Medium |
| BR-9 | `get-time-slots-date-range` drops provider-unavailable days (need them returned with `type:"not_available"` + lunch) | Medium |
| BR-10 | `get-time-slots-date-range` can't identify the patient's own booking / same-visit-type-per-day (need `existing_appointment` + `booking_locked`; depends on BR-3 `patient_id`) | Medium |
| BR-11 | `get-time-slots-date-range` exposes no capacity or group-window data (need `allow_multiple`/`capacity`/`remaining` + window `start`/`end`) | Medium |
| BR-12 | Reschedule calendar has no per-date holiday/provider-leave + reason across a month (need a range availability-status endpoint, or extend BR-9) for red highlighting + tooltip | Medium |

**Reason (applies to all items):** This logic and these data mappings must be implemented in the backend so they can be shared by both the Patient Portal web application and the future mobile application. The frontend will not implement workarounds, assumptions, or defaults.

**Next step:** Once the backend is updated per the above, the frontend team will **re-audit** the APIs (verify endpoints exist, return all required fields, and match the UI needs) **before** writing any frontend code for Steps 4.1, 5.1, and 5.2.

import { useState, useEffect, useCallback, useMemo, useRef, type ComponentProps } from "react";
import {
  Clock,
  MapPin,
  Video,
  CalendarDays,
  CalendarClock,
  CalendarCheck,
  ArrowRight,
  Stethoscope,
  User,
  X,
  Loader2,
  Plus,
} from "lucide-react";
import PageLoader from "@/components/PageLoader";
import ScheduleAppointmentModal from "@/components/ScheduleAppointmentModal";
import SelectPreauthorizationModal, { type PreauthRecord, preauthState } from "@/components/SelectPreauthorizationModal";
import ActivationRequiredModal from "@/components/ActivationRequiredModal";
import BookingTooSoonModal from "@/components/BookingTooSoonModal";
import { useAuth } from "@/contexts/AuthContext";
import SlotTooShortModal from "@/components/SlotTooShortModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parse, isValid, startOfDay } from "date-fns";
import Apis from "@/lib/Apis";
import { getActiveCaseId } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { formatDate, getDayOfWeek, getMonthShort, getDayOfMonth, getAppointmentTimestamp } from "@/lib/utils";

interface Appointment {
  id: number;
  attend_date: string;
  service_full_name: string;
  attend_type_full_name: string;
  provider_name: string;
  time: string;
  end_time: string;
  department: string;
  attend_type?: string;
  status?: string;
  is_virtual_text?: string | null;
  // The appointment's REAL status code from get-patient-appointments: "S"
  // (scheduled) / "CI" / "CO" / "NS" / "Cancelled". Use this — NOT `appt_status`,
  // which the API hardcodes to "Confirmed" on every row regardless of state.
  attend_status?: string | null;
  appt_status?: string | null;
  // Pre-auth service window. When the appointment was booked against a pre-auth,
  // rescheduling is restricted to this range. `ext_date`, when present, extends
  // (and overrides) `svc_date_end` as the range's upper bound.
  svc_date_start?: string | null;
  svc_date_end?: string | null;
  ext_date?: string | null;
  // How the appointment was booked (from get-patient-appointments). Only
  // "preauth"-booked appointments are constrained to the pre-auth service window
  // when rescheduling; anything else may move to any future date.
  made_via?: string | null;
}

// Appointment status vocabulary — maps `attend_status` to the label shown on the card:
//   state       attend_status   label
//   Scheduled   S               Confirmed
//   Check-in    CI              Check In
//   Check-out   CO, 1           Check Out
//   No Show     NS              No Show
//   Cancelled   C, "Cancelled"  Cancelled
// The API mixes codes and literals — a scheduled visit sends "S" while a cancelled
// one sends "Cancelled" verbatim. Codes map to a label; anything already sent as a
// label falls through unchanged (see `appointmentStatusOf`).
const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  S: "Confirmed",
  CI: "Check In",
  "Check-in": "Check In",
  CO: "Check Out",
  "1": "Check Out",
  NS: "No Show",
  C: "Cancelled",
};

// Colour per status label — a light tint of the matching action button's colour
// (Check In = yellow, Check Out = green, Cancel = red, …). This is a *styling* map
// only, NOT a whitelist: any status the API returns is still rendered, falling back
// to UNKNOWN_TAG_STYLE, so a new/renamed backend status shows up (un-themed)
// instead of vanishing.
const APPOINTMENT_STATUS_STYLES: Record<string, string> = {
  Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  "Check In": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Check Out": "bg-green-50 text-green-700 border-green-200",
  "No Show": "bg-slate-100 text-slate-700 border-slate-300",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
  "Action Required": "bg-amber-50 text-amber-700 border-amber-200",
};
// Colour per visit type (`is_virtual_text`). Like the status map above this is a
// *styling* map, not a whitelist — an unmapped value still renders via
// UNKNOWN_TAG_STYLE rather than dropping the badge.
const APPOINTMENT_VISIT_TYPE_STYLES: Record<string, string> = {
  "In-Person": "bg-purple-50 text-purple-700 border-purple-200",
  Telehealth: "bg-green-50 text-green-700 border-green-200",
  Virtual: "bg-green-50 text-green-700 border-green-200",
};

// Neutral fallback for any status / visit-type value we have no specific colour
// for, so the badge shows what the API returned instead of vanishing.
const UNKNOWN_TAG_STYLE = "bg-muted text-muted-foreground border-border";

// Renders a value as a badge. Without `fallbackClassName` an unmapped value is
// hidden (used for the visit-type tag); with one, it always renders (status tag).
const renderAppointmentTag = (
  value: string | null | undefined,
  stylesMap: Record<string, string>,
  fallbackClassName?: string,
) => {
  if (!value) return null;
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  const tagClassName = stylesMap[normalizedValue] ?? fallbackClassName;
  if (!tagClassName) return null;

  return (
    <Badge variant="outline" className={tagClassName}>
      {normalizedValue}
    </Badge>
  );
};

// The appointment's live status as a patient-facing label.
//
// Reads `attend_status` — the only field carrying the real state. Note the API's
// `appt_status` is hardcoded to "Confirmed" on every row (verified against a live
// payload: a cancelled visit still returns appt_status "Confirmed" alongside
// attend_status "Cancelled"), so it must not be used here. `status` isn't returned
// at all. Codes are normalised to their label; a value already sent as a label
// (e.g. "Cancelled") passes straight through.
const appointmentStatusOf = (appointment: { attend_status?: string | null }): string => {
  const raw = (appointment.attend_status || "").trim();
  return APPOINTMENT_STATUS_LABELS[raw] ?? raw;
};

// Only a still-Scheduled appointment can be rescheduled/cancelled. Scheduled (code
// `S`) surfaces to the patient as "Confirmed" — every other state (In Progress /
// Attended / Not Attended / Cancelled) is terminal or in-flight, so no actions.
const MODIFIABLE_APPOINTMENT_STATUSES = new Set(["Confirmed"]);

const canModifyAppointment = (appointment: Appointment): boolean =>
  MODIFIABLE_APPOINTMENT_STATUSES.has(appointmentStatusOf(appointment));

// Toggle to re-enable the per-card "Cancel" button. Set to true to restore it.
// The cancel modal, handlers, state, and API call remain wired up regardless.
const SHOW_CANCEL_BUTTON = false;

// Format time to 12-hour format with AM/PM
const formatTime = (timeString: string): string => {
  if (!timeString) return "";
  try {
    const [hours, minutes] = timeString.split(":").map(Number);
    const date = new Date(2000, 0, 1, hours, minutes);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return timeString;
  }
};

// Calculate duration between two times in minutes
const calculateDuration = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0;
  try {
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);

    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;

    return endTotalMinutes - startTotalMinutes;
  } catch {
    return 0;
  }
};

// "HH:MM" → minutes since midnight.
const timeToMinutes = (hhmm: string): number => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// "HH:MM" + minutes → "HH:MM" (24h, wraps at midnight only defensively).
const addMinutesToTime = (hhmm: string, minutes: number): string => {
  const total = timeToMinutes(hhmm) + minutes;
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// Minutes → human label, e.g. 90 → "1 hour 30 minutes", 30 → "30 minutes".
const formatDurationLabel = (minutes: number): string => {
  if (minutes <= 0) return "0 minutes";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h > 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
  return parts.join(" ");
};

// Get sortable date/time value for chronological appointment ordering
const getAppointmentDateTime = (appointment: Appointment): number =>
  getAppointmentTimestamp(appointment.attend_date, appointment.time);

// Format date to YYYY-MM-DD for the native date input
const formatDateInput = (dateString: string): string => {
  if (!dateString) return "";
  const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return dateString;
};

const ITEMS_PER_PAGE = 5;

const formatKey = (key: string): string =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface AppointmentDetail {
  id: number;
  ma_id: number;
  department: string;
  service: string;
  attend_type: string;
  provider_id: number;
  provider_name: string;
  attend_date: string;
  time: string;
  end_time: string;
  length: string;
  attend_status: string;
  attend_notes: string | null;
  is_virtual: number;
  transport: number;
  // Booking channel + pre-auth service window (from get-appointment). These drive
  // the reschedule date-range restriction; only present/meaningful for pre-auth bookings.
  made_via?: string | null;
  svc_date_start?: string | null;
  svc_date_end?: string | null;
  ext_date?: string | null;
}

interface RescheduleReason {
  id: number;
  reason: string;
}

// Minimum lead time (hours) before an appointment slot may be rescheduled. Mirrors
// the booking flow's backend rule; surfaced here only for immediate UX feedback.
const MIN_LEAD_HOURS = 24;

const RESCHEDULE_TOO_SOON_TITLE = "Cannot Reschedule This Appointment";
const RESCHEDULE_TOO_SOON_MESSAGE =
  "Appointments can only be rescheduled at least 24 hours in advance. If you still need to reschedule this appointment, please contact the support team for assistance.";

const CANCEL_TOO_SOON_TITLE = "Cannot Cancel This Appointment";
const CANCEL_TOO_SOON_MESSAGE =
  "Appointments can only be cancelled at least 24 hours in advance. If you still need to cancel this appointment, please contact the support team for assistance.";

// True when the given date (yyyy-MM-dd) + start time (HH:MM) is less than
// MIN_LEAD_HOURS from now, i.e. too soon to reschedule to.
const isRescheduleTooSoon = (dateYmd: string, startHHMM: string): boolean => {
  if (!dateYmd || !startHHMM) return false;
  const dt = parse(`${dateYmd} ${startHHMM}`, "yyyy-MM-dd HH:mm", new Date());
  if (!isValid(dt)) return false;
  return dt.getTime() - Date.now() < MIN_LEAD_HOURS * 60 * 60 * 1000;
};

// A single selectable start/end time returned by the `available-time-slots` API.
// `value` is 24h "HH:MM" (used in the reschedule payload); `label` is the display
// text with the backend's own markers, e.g. "09:00 am (Booked)" / "(Lunch)".
interface SlotOption {
  value: string;
  label: string;
  disabled: boolean;
  type: string;
}

// Tag ONLY the appointment's own exact start time as `current` (selectable) so the
// existing slot shows as "Booked". The other slots of the current appointment's window
// come back as `type:"booked"` and stay hidden — we must not mark the whole span as
// booked. Ensures the start is present even if the API omitted it.
const withCurrentStart = (options: SlotOption[], rangeStart: string): SlotOption[] => {
  if (!rangeStart) return options;
  const marked = options.map((o) =>
    o.value === rangeStart ? { ...o, type: "current", disabled: false } : o,
  );
  if (!marked.some((o) => o.value === rangeStart)) {
    return [{ value: rangeStart, label: formatTime(rangeStart), disabled: false, type: "current" }, ...marked];
  }
  return marked;
};

// Slot types the patient can't book, all surfaced generically as "– Not Available":
// booked / cross-location booked / blocked, plus the backend's `not_available`
// (which covers backend-owned rules such as the 24h advance-booking minimum).
// Mirrors ScheduleAppointmentModal: the patient must not learn whether a slot is
// booked, blocked, booked at another location, or blocked by a booking rule.
const OCCUPIED_SLOT_TYPES = new Set([
  "booked",
  "cross_location_booked",
  "blocked",
  "blocked_cross_location",
  "not_available",
  "unavailable",
]);

// True when an END option can actually close an appointment starting at the chosen
// start — i.e. it is available (not booked/blocked/lunch/holiday) and selectable.
const isSelectableEnd = (o: SlotOption): boolean =>
  !o.disabled && !OCCUPIED_SLOT_TYPES.has(o.type);

// Continuous availability (minutes) from `start`: walk the returned ends in order
// and extend through consecutive selectable ends, stopping at the first blocked one.
// The backend returns valid ends contiguously, so this is the longest span bookable
// from `start` before hitting a booking/blocker.
const continuousAvailMin = (start: string, ends: SlotOption[]): number => {
  const startMin = timeToMinutes(start);
  const sorted = ends
    .map((e) => ({ min: timeToMinutes(e.value), ok: isSelectableEnd(e) }))
    .filter((e) => e.min > startMin)
    .sort((a, b) => a.min - b.min);
  let cap = startMin;
  for (const e of sorted) {
    if (!e.ok) break;
    cap = e.min;
  }
  return cap - startMin;
};

// Per-date availability for the reschedule calendar. `available` = the provider
// works that day AND has at least one open slot; `holiday` / `leave` = tooltip
// label for a red-highlighted company holiday / provider all-day leave. Derived
// from ONE `get-time-slots-date-range` call per month (not per-day).
export interface DayAvailability {
  available: boolean;
  holiday?: string;
  leave?: string;
}

// One date entry from `get-time-slots-date-range`. Per the backend
// (PhysicanController::getTimeSlotsForDateRange): weekends are omitted entirely;
// every returned date carries populated `is_holiday` / `holiday_name`, and closed
// days carry `unavailable_reason` ("provider_absence" = all-day leave,
// "not_scheduled"/"no_availability" = non-working). Slots are empty on closed days.
interface RangeDateSlots {
  date: string; // "yyyy-MM-dd"
  is_holiday?: boolean;
  holiday_name?: string | null;
  is_available?: boolean;
  unavailable_reason?: string | null;
  slots?: { time: string; type: string; disabled: boolean; is_lunch?: boolean }[];
}

// Classify one date from the range response. Absent (weekend) → grey/unavailable;
// holiday → red + tooltip; provider all-day leave → red + tooltip; otherwise
// selectable only when it has an open (available) slot.
const classifyRangeDate = (entry: RangeDateSlots | undefined): DayAvailability => {
  if (!entry) return { available: false }; // omitted → weekend / past
  if (entry.is_holiday === true || entry.slots?.some((s) => s.type === "holiday")) {
    return { available: false, holiday: entry.holiday_name || "Holiday" };
  }
  if (entry.unavailable_reason === "provider_absence") {
    return { available: false, leave: "Provider on leave" };
  }
  const slots = entry.slots;
  if (!Array.isArray(slots) || slots.length === 0) return { available: false }; // not_scheduled / no_availability
  return { available: slots.some((s) => !s.disabled && s.type === "available") };
};

// Load real availability for a provider on a given date. `startTime` drives the
// returned `end_times` (valid ends for that start). Returns null on network error.
const fetchRescheduleSlots = async (
  detail: AppointmentDetail,
  date: string,
  startTime: string,
): Promise<{ starts: SlotOption[]; ends: SlotOption[] } | null> => {
  try {
    const res = await Apis.getAvailableTimeSlots(
      detail.provider_id,
      detail.department,
      detail.service,
      detail.attend_type,
      date,
      startTime,
      getActiveCaseId(),
    );
    if (!res.status) {
      // Provider not available at this location/date (e.g. multi-location:
      // "start_time is outside provider schedule", "Provider not available…").
      // Surface this inline as "Not Available" in the Start dropdown, not as a
      // toast with the raw backend message.
      return { starts: [], ends: [] };
    }
    return {
      starts: Array.isArray(res.start_times) ? res.start_times : [],
      ends: Array.isArray(res.end_times) ? res.end_times : [],
    };
  } catch (error) {
    toast.error(getApiErrorMessage(error));
    return null;
  }
};

// Parse a 12-hour range-endpoint label ("8:00 AM") into 24h "HH:MM".
const rangeLabelTo24h = (label: string): string => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(label).trim());
  if (!m) return "";
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

// Load the provider's actual Start-time options for a date at the appointment's
// location using `get-time-slots-date-range` (location-scoped, single-day range,
// needs NO start_time). This replaces the fixed `start_time=08:00`
// `available-time-slots` probe, which errored with "start_time is outside provider
// schedule" when the provider's hours for that location/date didn't start at 08:00
// (multi-location providers). Available slots are selectable; booked/lunch/blocked/
// holiday slots come back disabled ("– Not Available").
const fetchRescheduleStartsForDate = async (
  detail: AppointmentDetail,
  ymd: string,
): Promise<SlotOption[]> => {
  try {
    const res = await Apis.getTimeSlotDateRange(
      detail.provider_id,
      detail.department,
      ymd,
      ymd,
      getActiveCaseId(),
      detail.attend_type,
      detail.service,
    );
    if (!res?.status) return [];
    const dates: RangeDateSlots[] = Array.isArray(res.dates) ? res.dates : [];
    const day = dates.find((d) => d.date === ymd) ?? dates[0];
    return (day?.slots ?? [])
      .map((s) => ({
        value: rangeLabelTo24h(s.time),
        label: s.time,
        disabled: !!s.disabled || s.type !== "available",
        type: s.type,
      }))
      .filter((o) => o.value !== "");
  } catch {
    return [];
  }
};

export default function Appointments() {
  const { user } = useAuth();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  // Active preauthorizations for the current case. Fetched on demand when the
  // Schedule button is clicked (not on load) so the page mounts faster. Every
  // record returned by get-approved-preauth is already "active" (Approved + sessions left).
  const [preauths, setPreauths] = useState<PreauthRecord[]>([]);
  // True only while the on-click get-approved-preauth fetch is in flight.
  const [preauthsLoading, setPreauthsLoading] = useState(false);
  const [selectedPreauth, setSelectedPreauth] = useState<PreauthRecord | null>(null);
  const [isSelectPreauthOpen, setIsSelectPreauthOpen] = useState(false);
  const [isNoPreauthOpen, setIsNoPreauthOpen] = useState(false);
  // Activation Required flow: shown when a not-ready preauth is chosen.
  const [activationPreauth, setActivationPreauth] = useState<PreauthRecord | null>(null);
  // True when Activation Required was reached from the Select Preauthorization
  // picker, so closing it should return the user to that list.
  const [activationFromSelect, setActivationFromSelect] = useState(false);
  const [isActivationOpen, setIsActivationOpen] = useState(false);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [displayedUpcomingCount, setDisplayedUpcomingCount] = useState(ITEMS_PER_PAGE);
  const [displayedPastCount, setDisplayedPastCount] = useState(ITEMS_PER_PAGE);
  const [selectedVisit, setSelectedVisit] = useState<Record<string, unknown> | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStartTime, setRescheduleStartTime] = useState("");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  // Free-text reason shown/required only when the selected reason is "Other".
  const [rescheduleOtherReason, setRescheduleOtherReason] = useState("");
  // Inline field-level validation messages for the reschedule form.
  const [rescheduleErrors, setRescheduleErrors] = useState<{ startTime?: string; reason?: string; otherReason?: string }>({});
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [isRescheduleSubmitting, setIsRescheduleSubmitting] = useState(false);
  const [appointmentDetail, setAppointmentDetail] = useState<AppointmentDetail | null>(null);
  const [rescheduleReasons, setRescheduleReasons] = useState<RescheduleReason[]>([]);
  const [rescheduleStartOptions, setRescheduleStartOptions] = useState<SlotOption[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [showRescheduleTooSoon, setShowRescheduleTooSoon] = useState(false);
  // ── Cancel appointment flow ──
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelAppointmentRow, setCancelAppointmentRow] = useState<Appointment | null>(null);
  const [cancelDetail, setCancelDetail] = useState<AppointmentDetail | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOtherReason, setCancelOtherReason] = useState("");
  const [cancelErrors, setCancelErrors] = useState<{ reason?: string; otherReason?: string }>({});
  const [isCancelLoading, setIsCancelLoading] = useState(false);
  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false);
  const [showCancelTooSoon, setShowCancelTooSoon] = useState(false);
  // Non-null while the "selected start can't fit the required duration" modal is
  // shown (e.g. picking a start that overlaps a later booking). Mirrors the
  // booking flow's tooShortInfo pattern.
  const [slotTooShortInfo, setSlotTooShortInfo] = useState<{ available: string; required: string } | null>(null);
  // Per-date availability for the reschedule calendar (yyyy-MM-dd → status), used to
  // disable non-working days and red-highlight holidays / provider-leave. Populated
  // lazily per visible month from `available-time-slots`.
  const [rescheduleDayInfo, setRescheduleDayInfo] = useState<Record<string, DayAvailability>>({});
  // "yyyy-MM" months already fetched this modal session, so navigating back to a
  // month never refetches and month navigation fires at most one request.
  const loadedMonthsRef = useRef<Set<string>>(new Set());

  // Earliest selectable reschedule date = later of today and the pre-auth window start.
  // The window dates come from the pre-auth; read them from whichever source has them
  // (the get-appointment detail OFTEN omits them, but the list row that opened the modal
  // carries them). No `made_via` gate — if a window exists, the calendar is bounded by it.
  const rescheduleMinDate = useMemo(() => {
    const today = startOfDay(new Date());
    const startStr = appointmentDetail?.svc_date_start || rescheduleAppointment?.svc_date_start;
    if (!startStr) return today;
    const start = parse(formatDateInput(startStr), "yyyy-MM-dd", new Date());
    return isValid(start) && start > today ? start : today;
  }, [appointmentDetail, rescheduleAppointment]);

  // Latest selectable reschedule date = the pre-auth window's end. `ext_date` (extension)
  // overrides `svc_date_end`. Read from whichever source has it; undefined (no upper
  // bound) only when NO window end is present on either object.
  const rescheduleMaxDate = useMemo(() => {
    const ext = appointmentDetail?.ext_date || rescheduleAppointment?.ext_date;
    const svcEnd = appointmentDetail?.svc_date_end || rescheduleAppointment?.svc_date_end;
    const endStr = ext || svcEnd;
    if (!endStr) return undefined;
    const end = parse(formatDateInput(endStr), "yyyy-MM-dd", new Date());
    return isValid(end) ? end : undefined;
  }, [appointmentDetail, rescheduleAppointment]);

  // Reschedule is allowed only once the chosen date+time differs from the current
  // appointment. The current slot IS the active appointment, so re-picking it (same
  // date + same time) must NOT enable the button. Date change is optional — a different
  // time on the SAME day is a valid reschedule; but a time must be selected.
  const rescheduleChanged = useMemo(() => {
    if (!appointmentDetail || !rescheduleDate || !rescheduleStartTime) return false;
    const curDate = formatDateInput(appointmentDetail.attend_date);
    const curStart = appointmentDetail.time ? appointmentDetail.time.substring(0, 5) : "";
    return rescheduleDate !== curDate || rescheduleStartTime !== curStart;
  }, [appointmentDetail, rescheduleDate, rescheduleStartTime]);

  // Load the given month's availability with a SINGLE `get-time-slots-date-range`
  // call (not per-day — that endpoint rate-limits at ~30 calls/month, causing the
  // 429s + slow calendar). Populates `rescheduleDayInfo` so the calendar can disable
  // non-working days and red-highlight holidays. Clamped to today/window bounds;
  // fails open (disables nothing) on a non-success response so an error never
  // wrongly blocks the whole month.
  const loadRescheduleMonthAvailability = async (
    detail: AppointmentDetail,
    year: number,
    monthIndex0: number,
  ) => {
    const monthKey = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
    if (loadedMonthsRef.current.has(monthKey)) return;
    const today = startOfDay(new Date());
    let rangeStart = new Date(year, monthIndex0, 1);
    if (rangeStart < today) rangeStart = today;
    if (rescheduleMinDate && rangeStart < rescheduleMinDate) rangeStart = rescheduleMinDate;
    let rangeEnd = new Date(year, monthIndex0 + 1, 0);
    if (rescheduleMaxDate && rangeEnd > rescheduleMaxDate) rangeEnd = rescheduleMaxDate;
    if (rangeStart > rangeEnd) return; // nothing selectable this month
    let res: { status?: boolean; dates?: RangeDateSlots[] } | null = null;
    try {
      res = await Apis.getTimeSlotDateRange(
        detail.provider_id,
        detail.department,
        format(rangeStart, "yyyy-MM-dd"),
        format(rangeEnd, "yyyy-MM-dd"),
        getActiveCaseId(),
        detail.attend_type,
        detail.service,
      );
    } catch {
      return; // fail open; allow a retry on the next month navigation
    }
    if (!res || res.status === false) return; // ambiguous error — don't disable
    loadedMonthsRef.current.add(monthKey);
    const byDate = new Map((Array.isArray(res.dates) ? res.dates : []).map((d) => [d.date, d]));
    const next: Record<string, DayAvailability> = {};
    for (let dt = new Date(rangeStart); dt <= rangeEnd; dt.setDate(dt.getDate() + 1)) {
      const ymd = format(dt, "yyyy-MM-dd");
      next[ymd] = classifyRangeDate(byDate.get(ymd));
    }
    setRescheduleDayInfo((prev) => ({ ...prev, ...next }));
  };

  // Load the given month plus its immediate neighbours, so navigating one month
  // either way shows availability instantly (already prefetched) instead of waiting
  // on the request. Each month is fetched at most once (deduped), and fully-past
  // neighbours are skipped — so this is at most a few one-shot range calls.
  const loadRescheduleMonthWindow = (detail: AppointmentDetail, year: number, monthIndex0: number) => {
    [0, 1, -1].forEach((offset) => {
      const d = new Date(year, monthIndex0 + offset, 1);
      loadRescheduleMonthAvailability(detail, d.getFullYear(), d.getMonth());
    });
  };

  // Seed the time selects from the appointment's own date/time and load the real
  // availability for that date so Start/End show the actual slot (not a static list).
  const initRescheduleSlots = async (detail: AppointmentDetail) => {
    const date = formatDateInput(detail.attend_date);
    const start = detail.time ? detail.time.substring(0, 5) : "";
    const end = detail.end_time ? detail.end_time.substring(0, 5) : "";
    // Pre-select the appointment's current start/end (marked "– Current").
    setRescheduleStartTime(start);
    setRescheduleEndTime(end);
    setRescheduleStartOptions([]); // empty → the day loader shows (not a stale grid)
    setRescheduleSlotsLoading(true);
    // Start options come from the provider's real schedule for this date + location.
    const starts = await fetchRescheduleStartsForDate(detail, date);
    setRescheduleSlotsLoading(false);
    setRescheduleStartOptions(withCurrentStart(starts, start));
  };

  // Date changed: immediately load the provider's real Start-time options for that
  // date + the appointment's location (via get-time-slots-date-range — no fixed
  // start_time, so no "start_time is outside provider schedule" error). Start/End
  // reset to unselected; the user then picks a start.
  const handleRescheduleDateChange = async (ymd: string) => {
    // Re-selecting the already-chosen date is a no-op — don't reload the options or
    // clear the currently selected Start/End time.
    if (ymd && ymd === rescheduleDate) return;

    // Holiday / provider-leave days are shown (red) but not selectable — reject the
    // click with an explanatory toast and keep the previous date.
    const dayInfo = ymd ? rescheduleDayInfo[ymd] : undefined;
    if (dayInfo?.holiday) {
      toast.error(`This date is a company holiday (${dayInfo.holiday}). Please pick another date.`);
      return;
    }
    if (dayInfo?.leave) {
      toast.error("The provider is on leave on this date. Please pick another date.");
      return;
    }
    const prevStart = rescheduleStartTime;
    setRescheduleDate(ymd);
    setRescheduleErrors((prev) => ({ ...prev, startTime: undefined }));
    const detail = appointmentDetail;
    if (!detail || !ymd) {
      setRescheduleStartOptions([]);
      setRescheduleStartTime("");
      setRescheduleEndTime("");
      return;
    }
    setRescheduleStartOptions([]); // empty → the day loader shows (not the old day's grid)
    setRescheduleSlotsLoading(true);
    const starts = await fetchRescheduleStartsForDate(detail, ymd);
    setRescheduleSlotsLoading(false);
    // Mark the current window "– Current" only on the appointment's own date.
    const isOriginalDate = ymd === formatDateInput(detail.attend_date);
    const options = isOriginalDate
      ? withCurrentStart(starts, detail.time.substring(0, 5))
      : starts;
    setRescheduleStartOptions(options);

    // Keep the previously-selected Start/End if the full required duration still
    // fits on the new date (every 15-min block in [start, start+duration) is
    // available); otherwise clear so the user re-picks.
    const duration = calculateDuration(detail.time.substring(0, 5), detail.end_time.substring(0, 5));
    const availableByMin = new Map(options.map((o) => [timeToMinutes(o.value), !o.disabled]));
    const blocks = duration > 0 ? Math.max(1, Math.round(duration / 15)) : 0;
    const durationStillFits =
      !!prevStart &&
      blocks > 0 &&
      Array.from({ length: blocks }, (_, i) => timeToMinutes(prevStart) + i * 15).every(
        (t) => availableByMin.get(t) === true,
      );
    if (durationStillFits) {
      setRescheduleStartTime(prevStart);
      setRescheduleEndTime(addMinutesToTime(prevStart, duration));
    } else {
      setRescheduleStartTime("");
      setRescheduleEndTime("");
    }
  };

  // Start time changed: set End = Start + the appointment's required duration, and
  // reject the pick if that full span isn't available (overlaps a later booking).
  const handleRescheduleStartChange = async (value: string) => {
    // NOTE: the 24h minimum lead time is enforced by the backend — it returns those
    // slots as `type: "not_available"` / `disabled: true`, so they render as
    // "– Not Available" and can't be picked. No client-side check / modal needed.
    const detail = appointmentDetail;
    if (!detail || !rescheduleDate || !value) {
      // Cleared back to the "Select Start Time" placeholder → clear the derived End.
      setRescheduleStartTime(value);
      setRescheduleEndTime("");
      return;
    }
    const prevStart = rescheduleStartTime;
    setRescheduleStartTime(value);
    setRescheduleSlotsLoading(true);
    const slots = await fetchRescheduleSlots(detail, rescheduleDate, value);
    setRescheduleSlotsLoading(false);
    const ends = slots?.ends ?? [];
    // Required length = the appointment's own duration; End must be Start + that.
    const duration = calculateDuration(detail.time.substring(0, 5), detail.end_time.substring(0, 5));
    const desiredEnd = duration > 0 ? addMinutesToTime(value, duration) : "";
    const endFits = !!desiredEnd && ends.some((e) => e.value === desiredEnd && isSelectableEnd(e));
    if (duration > 0 && !endFits) {
      // The full duration doesn't fit from here (e.g. a later booking overlaps).
      // Warn and revert to the previous start, keeping its end options intact.
      setSlotTooShortInfo({
        available: formatDurationLabel(continuousAvailMin(value, ends)),
        required: formatDurationLabel(duration),
      });
      setRescheduleStartTime(prevStart);
      return;
    }
    setRescheduleEndTime(desiredEnd || ends.find((e) => !e.disabled)?.value || "");
  };

  const openRescheduleModal = async (appointment: Appointment) => {
    // Enforce the 24h lead time up front: if the appointment is less than 24h
    // away it can't be rescheduled, so show the restriction modal immediately and
    // never open the Reschedule modal (better UX than opening then blocking).
    const apptStart = appointment.time ? appointment.time.substring(0, 5) : "";
    if (isRescheduleTooSoon(formatDateInput(appointment.attend_date), apptStart)) {
      setShowRescheduleTooSoon(true);
      return;
    }
    setRescheduleAppointment(appointment);
    // Prefill display + editable fields from the list row we already have, so the
    // modal is fully populated regardless of the get-appointment detail fetch below.
    setRescheduleDate(formatDateInput(appointment.attend_date));
    // Pre-fill the current start/end from the list row (refined by the detail fetch).
    setRescheduleStartTime(appointment.time ? appointment.time.substring(0, 5) : "");
    setRescheduleEndTime(appointment.end_time ? appointment.end_time.substring(0, 5) : "");
    setRescheduleReason("");
    setRescheduleOtherReason("");
    setRescheduleErrors({});
    setAppointmentDetail(null);
    setRescheduleReasons([]);
    setRescheduleStartOptions([]);
    setShowRescheduleTooSoon(false);
    setSlotTooShortInfo(null);
    setRescheduleDayInfo({});
    loadedMonthsRef.current = new Set();
    setIsModalLoading(true);
    setIsRescheduleOpen(true);

    try {
      const [apptRes, reasonsRes] = await Promise.all([
        Apis.getAppointment(appointment.id),
        Apis.getAppointmentReasons(),
      ]);

      // The detail fetch supplies only the submit-only identifiers (ma_id,
      // provider_id, service) that the list row lacks — the display no longer
      // depends on it. Tolerate either an array-wrapped or single-object shape.
      if (apptRes.success) {
        const detail: AppointmentDetail | undefined = Array.isArray(apptRes.data)
          ? apptRes.data[0]
          : (apptRes.data as AppointmentDetail | undefined);
        if (detail) {
          setAppointmentDetail(detail);
          // Load the real start/end time slots for the appointment's own date.
          await initRescheduleSlots(detail);
          // Paint the appointment's month (+ neighbours, so navigation is instant):
          // disable non-working days, red-highlight holidays / provider-leave.
          const apptDate = parse(formatDateInput(detail.attend_date), "yyyy-MM-dd", new Date());
          if (isValid(apptDate)) {
            loadRescheduleMonthWindow(detail, apptDate.getFullYear(), apptDate.getMonth());
          }
        } else {
          toast.error(apptRes.message || apptRes.error || "Failed to load appointment details.");
        }
      } else {
        toast.error(apptRes.message || apptRes.error || "Failed to load appointment details.");
      }

      if (reasonsRes.success && Array.isArray(reasonsRes.data)) {
        setRescheduleReasons(reasonsRes.data);
      } else {
        toast.error(reasonsRes.message || reasonsRes.error || "Failed to load reschedule reasons.");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsModalLoading(false);
    }
  };

  const closeRescheduleModal = () => {
    // Only flip the open flag — keep appointment data so content stays visible
    // during Radix's exit animation. Data is cleared after animation completes.
    setIsRescheduleOpen(false);
  };

  const refreshUpcomingAppointments = async () => {
    try {
      const data = await Apis.getPatientAppointments();
      if (data.success) {
        const upcoming = [...(data.upcoming_appointments || [])].sort(
          (a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b)
        );
        setUpcomingAppointments(upcoming);
      }
    } catch {
      // silently ignore refresh errors
    }
  };

  const handleRescheduleSubmit = async () => {
    // Defensive 24h lead-time re-check. The backend already excludes <24h slots from
    // the options, so this only catches a stale modal — one left open long enough that
    // an already-picked start has since fallen inside the 24h window.
    if (isRescheduleTooSoon(rescheduleDate, rescheduleStartTime)) {
      setShowRescheduleTooSoon(true);
      return;
    }
    if (!appointmentDetail) return;

    const selectedReasonObj = rescheduleReasons.find((r) => String(r.id) === rescheduleReason);
    const isOther = (selectedReasonObj?.reason ?? "").trim().toLowerCase() === "other";

    // Field-level validation shown inline under each field (not as a toast).
    const errors: { startTime?: string; reason?: string; otherReason?: string } = {};
    if (!rescheduleStartTime || !rescheduleEndTime) {
      errors.startTime = "Please select a start time.";
    } else if (!rescheduleChanged) {
      // The current slot is the active appointment — a different time must be chosen.
      errors.startTime = "Please select a different time slot to reschedule.";
    }
    if (!selectedReasonObj) {
      errors.reason = "Please select a reason for rescheduling.";
    }
    if (isOther && !rescheduleOtherReason.trim()) {
      errors.otherReason = "Please specify the reason for rescheduling.";
    }
    setRescheduleErrors(errors);
    if (errors.startTime || errors.reason || errors.otherReason || !selectedReasonObj) return;

    // "Other" sends the free-text reason as the note.
    const attendNotes = isOther ? rescheduleOtherReason.trim() : selectedReasonObj.reason;

    setIsRescheduleSubmitting(true);
    try {
      const res = await Apis.rescheduleAppointment(appointmentDetail.id, appointmentDetail.ma_id, {
        department: appointmentDetail.department,
        service: appointmentDetail.service,
        provider_name: appointmentDetail.provider_name,
        provider_id: appointmentDetail.provider_id,
        attend_type: appointmentDetail.attend_type,
        attend_status: "RS",
        attend_date: rescheduleDate,
        time: rescheduleStartTime,
        end_time: rescheduleEndTime,
        attend_notes: attendNotes,
        attend_reason_id: selectedReasonObj.id,
      });

      if (res.success === false) {
        toast.error(res.message || res.error || "Failed to reschedule appointment.");
      } else {
        toast.success("Appointment rescheduled successfully.");
        closeRescheduleModal();
        refreshUpcomingAppointments();
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsRescheduleSubmitting(false);
    }
  };

  // Open the Cancel modal. Enforces the same 24h lead time as Reschedule up front:
  // an appointment less than 24h away can't be cancelled here, so show the
  // restriction modal instead of opening (better UX than opening then blocking).
  const openCancelModal = async (appointment: Appointment) => {
    const apptStart = appointment.time ? appointment.time.substring(0, 5) : "";
    if (isRescheduleTooSoon(formatDateInput(appointment.attend_date), apptStart)) {
      setShowCancelTooSoon(true);
      return;
    }
    setCancelAppointmentRow(appointment);
    setCancelDetail(null);
    setCancelReason("");
    setCancelOtherReason("");
    setCancelErrors({});
    setRescheduleReasons([]);
    setIsCancelLoading(true);
    setIsCancelOpen(true);
    try {
      const [apptRes, reasonsRes] = await Promise.all([
        Apis.getAppointment(appointment.id),
        Apis.getAppointmentReasons(),
      ]);
      // The detail fetch supplies the submit-only identifiers (ma_id, provider_id).
      if (apptRes.success) {
        const detail: AppointmentDetail | undefined = Array.isArray(apptRes.data)
          ? apptRes.data[0]
          : (apptRes.data as AppointmentDetail | undefined);
        if (detail) setCancelDetail(detail);
        else toast.error(apptRes.message || apptRes.error || "Failed to load appointment details.");
      } else {
        toast.error(apptRes.message || apptRes.error || "Failed to load appointment details.");
      }
      if (reasonsRes.success && Array.isArray(reasonsRes.data)) {
        setRescheduleReasons(reasonsRes.data);
      } else {
        toast.error(reasonsRes.message || reasonsRes.error || "Failed to load cancellation reasons.");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsCancelLoading(false);
    }
  };

  const closeCancelModal = () => setIsCancelOpen(false);

  const handleCancelSubmit = async () => {
    if (!cancelDetail || !cancelAppointmentRow) return;

    const selectedReasonObj = rescheduleReasons.find((r) => String(r.id) === cancelReason);
    const isOther = (selectedReasonObj?.reason ?? "").trim().toLowerCase() === "other";

    // Field-level validation shown inline under each field (not as a toast).
    const errors: { reason?: string; otherReason?: string } = {};
    if (!selectedReasonObj) errors.reason = "Please select a reason for cancelling.";
    if (isOther && !cancelOtherReason.trim()) {
      errors.otherReason = "Please specify the reason for cancelling.";
    }
    setCancelErrors(errors);
    if (errors.reason || errors.otherReason || !selectedReasonObj) return;

    const attendNotes = isOther ? cancelOtherReason.trim() : selectedReasonObj.reason;
    const caseId = getActiveCaseId();
    setIsCancelSubmitting(true);
    try {
      const res = await Apis.cancelAppointment(user?.name ?? "", caseId, cancelDetail.id, {
        attend_id: cancelDetail.id,
        ma_id: cancelDetail.ma_id,
        case_id: caseId,
        provider_id: cancelDetail.provider_id,
        attend_date2: formatDateInput(cancelDetail.attend_date),
        attend_status: "Cancelled",
        attend_reason_id: selectedReasonObj.id,
        attend_notes: attendNotes,
      });

      if (res.success === false) {
        toast.error(res.message || res.error || "Failed to cancel appointment.");
      } else {
        toast.success("Appointment cancelled successfully.");
        closeCancelModal();
        refreshUpcomingAppointments();
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsCancelSubmitting(false);
    }
  };

  // Load upcoming/past appointments. Reused on mount and after a successful
  // schedule so the list reflects newly-booked visits without a manual refresh.
  const loadAppointments = useCallback(async () => {
    try {
      const data = await Apis.getPatientAppointments();

      if (!data.success) {
        toast.error(data.message || data.error || "");
        return;
      }

      // Separate upcoming and past appointments
      const upcoming = [...(data.upcoming_appointments || [])].sort(
        (a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b)
      );
      const past = data.past_appointments || [];

      setUpcomingAppointments(upcoming);
      setPastAppointments(past);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch appointments on component mount
  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Open the Activation Required flow for a preauth the API reports is not ready.
  // `fromSelect` records whether we came from the picker so closing can return there.
  const openActivationRequired = (preauth: PreauthRecord, fromSelect = false) => {
    setActivationFromSelect(fromSelect);
    setActivationPreauth(preauth);
    setIsActivationOpen(true);
  };

  // A not-ready preauth was picked in the Select modal: close the picker and open
  // Activation Required, remembering to reopen the picker if the user backs out.
  const handleActivationFromSelect = (preauth: PreauthRecord) => {
    setIsSelectPreauthOpen(false);
    openActivationRequired(preauth, true);
  };

  // Close Activation Required. If it was reached from the picker, reopen the
  // picker so the user can choose a different preauthorization.
  const closeActivationRequired = () => {
    setIsActivationOpen(false);
    setActivationPreauth(null);
    if (activationFromSelect) {
      setActivationFromSelect(false);
      setIsSelectPreauthOpen(true);
    }
  };

  // get-approved-preauth returns either { count, data: [...] } or a bare []
  const fetchApprovedPreauths = async (): Promise<PreauthRecord[]> => {
    const res: any = await Apis.getApprovedPreauth();
    return Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
  };

  // An activation request was just submitted: refetch so `sent_request` comes back
  // true and the preauth reads as "Under Review" when the picker is reopened.
  const handleActivationSubmitted = async () => {
    try {
      const raw = await fetchApprovedPreauths();
      setPreauths(raw);
      setActivationPreauth((cur) =>
        cur ? raw.find((r) => String(r.ma_id) === String(cur.ma_id)) ?? cur : cur
      );
    } catch (error) {
      // Non-fatal: the request succeeded and the success view is already shown.
      console.error("Failed to refresh preauthorizations after activation request:", error);
    }
  };

  // Fetch preauthorizations on demand and decide which modal to open. Called
  // only when the Schedule button is clicked so nothing loads on page mount.
  const handleScheduleClick = async () => {
    setPreauthsLoading(true);
    try {
      const raw = await fetchApprovedPreauths();

      // Branch on the freshly fetched array (state updates are async).
      if (raw.length === 0) {
        setIsNoPreauthOpen(true);
      } else if (raw.length === 1) {
        // Skip the picker for a single preauth, but still gate on readiness. A
        // not-ready preauth opens Activation Required, which renders read-only
        // ("Under Review") when a request is already pending approval.
        if (preauthState(raw[0]) === "ready") {
          setSelectedPreauth(raw[0]);
          setScheduleModalOpen(true);
        } else {
          openActivationRequired(raw[0]);
        }
      } else {
        // Hand the list to the picker modal via the preauths prop.
        setPreauths(raw);
        setIsSelectPreauthOpen(true);
      }
    } catch (error) {
      console.error("Error fetching preauthorizations:", error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setPreauthsLoading(false);
    }
  };

  // A preauth was picked in the Select Preauthorization modal.
  const handlePreauthSelected = (preauth: PreauthRecord) => {
    setSelectedPreauth(preauth);
    setIsSelectPreauthOpen(false);
    setScheduleModalOpen(true);
  };

  // Show full-page loader while loading
  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground">Manage your upcoming visits and view past history.</p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90"
          disabled={preauthsLoading}
          onClick={handleScheduleClick}
        >
          {preauthsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Schedule Appointment
        </Button>
        <ScheduleAppointmentModal
          open={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false);
            setSelectedPreauth(null);
          }}
          onScheduled={loadAppointments}
          preauth={selectedPreauth}
        />
        <SelectPreauthorizationModal
          open={isSelectPreauthOpen}
          onClose={() => setIsSelectPreauthOpen(false)}
          preauths={preauths}
          onSelect={handlePreauthSelected}
          onActivationRequired={handleActivationFromSelect}
        />
        <ActivationRequiredModal
          open={isActivationOpen}
          onClose={closeActivationRequired}
          preauth={activationPreauth}
          onSubmitted={handleActivationSubmitted}
        />
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past Visits</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6 space-y-4">
          {upcomingAppointments.length === 0 ? (
            <Card className="shadow-soft">
              <CardContent className="p-6 text-center text-muted-foreground">
                No upcoming appointments. Schedule a visit to get started.
              </CardContent>
            </Card>
          ) : (
            <>
              {upcomingAppointments.slice(0, displayedUpcomingCount).map((appointment, index) => {
                const duration = calculateDuration(appointment.time, appointment.end_time);
                const canModify = canModifyAppointment(appointment);
                const isVirtual =
                  appointment.is_virtual_text?.toLowerCase() === "telehealth" ||
                  appointment.attend_type?.toLowerCase().includes("virtual") ||
                  appointment.attend_type?.toLowerCase().includes("telehealth");

                return (
                  <Card key={appointment.id || index} className="shadow-soft border-l-4 border-l-primary">
                    <CardContent className="px-6">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-shrink-0 flex flex-col items-center justify-center bg-secondary/50 rounded-xl p-4 w-full md:w-32 text-center">
                          <span className="text-sm font-bold text-primary uppercase tracking-wider">
                            {getMonthShort(appointment.attend_date)}
                          </span>
                          <span className="text-3xl font-bold my-1">
                            {getDayOfMonth(appointment.attend_date)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {getDayOfWeek(appointment.attend_date)}
                          </span>
                        </div>

                        <div className="flex-1 space-y-4">
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                {renderAppointmentTag(
                                  appointmentStatusOf(appointment),
                                  APPOINTMENT_STATUS_STYLES,
                                  UNKNOWN_TAG_STYLE,
                                )}
                                {renderAppointmentTag(
                                  appointment.is_virtual_text,
                                  APPOINTMENT_VISIT_TYPE_STYLES,
                                  UNKNOWN_TAG_STYLE,
                                )}
                              </div>
                              <h3 className="text-xl font-bold">
                                {appointment.service_full_name} {appointment.attend_type_full_name}
                              </h3>
                              <p className="text-muted-foreground">with {appointment.provider_name}</p>
                            </div>
                          </div>

                          {/* Time + Location sit next to each other (30px apart) rather than
                              in a 50/50 grid, which pushed Location far from the time. */}
                          <div className="flex flex-wrap items-center gap-y-1 gap-x-[30px] text-sm">
                            <div className="flex items-center gap-3">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {formatTime(appointment.time)} - {formatTime(appointment.end_time)} ({duration} min)
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              {isVirtual ? (
                                <>
                                  <Video className="h-4 w-4 text-muted-foreground" />
                                  <span>Video Visit</span>
                                </>
                              ) : (
                                <>
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span>{appointment.department}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Only a still-scheduled appointment can be changed. For a
                              cancelled / checked-in / no-show visit the actions stay
                              rendered but disabled, so every card keeps the same height.
                              The cursor lives on the wrapper because Button sets
                              `disabled:pointer-events-none` — a disabled button receives
                              no hover, so it can't show a cursor itself. */}
                          <div className="flex flex-wrap gap-3 pt-2">
                            <span className={cn("inline-flex", !canModify && "cursor-not-allowed")}>
                              <Button
                                variant="outline"
                                disabled={!canModify}
                                onClick={() => openRescheduleModal(appointment)}
                              >
                                <CalendarDays className="h-4 w-4" />
                                Reschedule
                              </Button>
                            </span>
                            {/* Same subtle outline style; a destructive tint (design-system
                                token, not a hardcoded red) marks it as the cancel action.
                                Hidden via SHOW_CANCEL_BUTTON — flip that flag to restore it. */}
                            {SHOW_CANCEL_BUTTON && (
                              <span className={cn("inline-flex", !canModify && "cursor-not-allowed")}>
                                <Button
                                  variant="outline"
                                  disabled={!canModify}
                                  onClick={() => openCancelModal(appointment)}
                                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                  Cancel
                                </Button>
                              </span>
                            )}
                          </div>

                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {upcomingAppointments.length > ITEMS_PER_PAGE && displayedUpcomingCount < upcomingAppointments.length && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDisplayedUpcomingCount(prev => prev + ITEMS_PER_PAGE)}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          <Card className="shadow-soft">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Visit History</CardTitle>
                {/* HIDDEN: Filter button hidden per UI requirements
                {pastAppointments.length > 0 && (
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-4 w-4" /> Filter
                  </Button>
                )}
                */}
              </div>
            </CardHeader>
            <CardContent>
              {pastAppointments.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No past visits found.
                </div>
              ) : (
                <div className="space-y-6">
                  {pastAppointments.slice(0, displayedPastCount).map((visit, i) => (
                    <div key={visit.id || i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b last:border-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-lg">
                          {visit.service_full_name} {visit.attend_type_full_name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <span>{formatDate(visit.attend_date)}</span>
                          <span>•</span>
                          <span>{visit.provider_name}</span>
                          <span>•</span>
                          <span>{visit.attend_type || "In-Person"}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedVisit(visit as unknown as Record<string, unknown>)}>View Summary</Button>
                        <Button variant="outline" size="sm" onClick={() => {
                          const url = (visit as unknown as Record<string, unknown>)["clinical_note"] as string | null | undefined;
                          if (url) {
                            window.open(url, "_blank", "noopener,noreferrer");
                          } else {
                            toast.error("Note is not available.");
                          }
                        }}>Notes</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {pastAppointments.length > ITEMS_PER_PAGE && displayedPastCount < pastAppointments.length && (
              <CardFooter className="bg-secondary/20 border-t p-4 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDisplayedPastCount(prev => prev + ITEMS_PER_PAGE)}
                >
                  Load More History
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* No Active Preauthorization info modal */}
      <Dialog open={isNoPreauthOpen} onOpenChange={(open) => { if (!open) setIsNoPreauthOpen(false); }}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[460px] w-[90%] p-6 gap-0 pointer-events-auto"
        >
          <DialogHeader className="min-h-auto">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-lg font-semibold">
                No Active Preauthorization Found
              </DialogTitle>
              <button
                onClick={() => setIsNoPreauthOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pt-3">
            You do not have any active preauthorizations. Please contact the support
            team to schedule an appointment.
          </p>
          <div className="pt-5 flex justify-end">
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setIsNoPreauthOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Physician Reschedule Modal */}
      <Dialog open={isRescheduleOpen} onOpenChange={(open) => { if (!open) closeRescheduleModal(); }}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[940px] w-[92%] max-h-[90vh] p-5 gap-0 pointer-events-auto flex flex-col"
          onAnimationEnd={() => { if (!isRescheduleOpen) { setRescheduleAppointment(null); setAppointmentDetail(null); setRescheduleReasons([]); } }}
        >
          <DialogHeader className="pb-4 border-b border-border min-h-auto flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-xl font-semibold">
                Reschedule
                {rescheduleAppointment && (
                  <span className="font-normal text-muted-foreground">
                    {" – "}{rescheduleAppointment.provider_name}
                  </span>
                )}
              </DialogTitle>
              <button
                onClick={closeRescheduleModal}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          {rescheduleAppointment && (
            <div className="py-5 space-y-5 overflow-auto flex-1 min-h-0">
              {isModalLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Provider context bar: Location · Provider Type · Provider · Preauth range */}
                  {(() => {
                    // Pre-auth authorized window (read from whichever source has it), so the
                    // patient can see the from–to range that bounds the calendar.
                    const svcStart = appointmentDetail?.svc_date_start || rescheduleAppointment.svc_date_start;
                    const rangeEnd =
                      appointmentDetail?.ext_date || rescheduleAppointment.ext_date ||
                      appointmentDetail?.svc_date_end || rescheduleAppointment.svc_date_end;
                    const fmtRange = (s?: string | null) => {
                      if (!s) return "";
                      const d = parse(formatDateInput(s), "yyyy-MM-dd", new Date());
                      return isValid(d) ? format(d, "MMM d, yyyy") : "";
                    };
                    const preauthRange =
                      svcStart && rangeEnd ? `In Between: ${fmtRange(svcStart)} – ${fmtRange(rangeEnd)}` : "";
                    const parts = [
                      { icon: MapPin, value: rescheduleAppointment.department },
                      {
                        icon: Stethoscope,
                        value: appointmentDetail?.service
                          ? `${appointmentDetail.service.toUpperCase()} (${rescheduleAppointment.service_full_name})`
                          : rescheduleAppointment.service_full_name,
                      },
                      { icon: User, value: rescheduleAppointment.provider_name },
                      { icon: CalendarDays, value: preauthRange },
                    ].filter((p) => p.value);
                    if (parts.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                        {parts.map(({ icon: Icon, value }, i) => (
                          <span
                            key={i}
                            className={cn("flex items-center gap-1.5", i > 0 && "border-l border-border pl-3")}
                          >
                            <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium text-foreground">{value}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Row 1: Date + Current/New summary side by side */}
                  <div className="flex flex-col sm:flex-row gap-5">
                    <div className="flex flex-col gap-2 sm:w-56 flex-shrink-0">
                      <label className="text-sm font-medium text-muted-foreground">Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 pr-3 text-sm text-foreground text-left flex items-center justify-between focus:outline-none focus:ring-0"
                          >
                            <span className={rescheduleDate ? "text-foreground" : "text-muted-foreground"}>
                              {rescheduleDate
                                ? format(parse(rescheduleDate, "yyyy-MM-dd", new Date()), "MM-dd-yyyy")
                                : "MM-DD-YYYY"}
                            </span>
                            <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="p-0 w-[--radix-popover-trigger-width]"
                        >
                          <Calendar
                            mode="single"
                            required
                            selected={
                              rescheduleDate && isValid(parse(rescheduleDate, "yyyy-MM-dd", new Date()))
                                ? parse(rescheduleDate, "yyyy-MM-dd", new Date())
                                : undefined
                            }
                            defaultMonth={
                              rescheduleDate && isValid(parse(rescheduleDate, "yyyy-MM-dd", new Date()))
                                ? parse(rescheduleDate, "yyyy-MM-dd", new Date())
                                : undefined
                            }
                            disabled={[
                              { before: rescheduleMinDate },
                              ...(rescheduleMaxDate ? [{ after: rescheduleMaxDate }] : []),
                              // Disable non-working days per the provider's real
                              // availability. Holiday / provider-leave days are left
                              // ENABLED (so the native red-day tooltip shows on hover —
                              // disabled buttons suppress it); their click is rejected
                              // in handleRescheduleDateChange. The appointment's own
                              // date is never disabled; unprobed days stay enabled until
                              // their availability loads.
                              (date: Date) => {
                                const ymd = format(date, "yyyy-MM-dd");
                                if (appointmentDetail && ymd === formatDateInput(appointmentDetail.attend_date)) {
                                  return false;
                                }
                                const info = rescheduleDayInfo[ymd];
                                if (!info || info.holiday || info.leave) return false;
                                return !info.available;
                              },
                            ]}
                            startMonth={rescheduleMinDate}
                            endMonth={rescheduleMaxDate}
                            onSelect={(date) => {
                              handleRescheduleDateChange(date ? format(date, "yyyy-MM-dd") : "");
                            }}
                            onMonthChange={(month) => {
                              if (appointmentDetail) {
                                loadRescheduleMonthWindow(
                                  appointmentDetail,
                                  month.getFullYear(),
                                  month.getMonth(),
                                );
                              }
                            }}
                            components={{
                              // Red-highlight holidays + provider-leave days and show a
                              // styled tooltip on hover explaining why they're unavailable.
                              DayButton: (dayProps: ComponentProps<typeof CalendarDayButton>) => {
                                const ymd = format(dayProps.day.date, "yyyy-MM-dd");
                                const info = rescheduleDayInfo[ymd];
                                const label = info?.holiday
                                  ? `Holiday: ${info.holiday}`
                                  : info?.leave;
                                const dayBtn = (
                                  <CalendarDayButton
                                    {...dayProps}
                                    className={cn(
                                      dayProps.className,
                                      label &&
                                        "text-red-600 font-semibold cursor-not-allowed aria-selected:text-red-600",
                                    )}
                                  />
                                );
                                if (!label) return dayBtn;
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>{dayBtn}</TooltipTrigger>
                                    <TooltipContent>{label}</TooltipContent>
                                  </Tooltip>
                                );
                              },
                            }}
                            className="w-full"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {/* Current / New summary, beside the Date field */}
                    <div className="flex-1 min-w-0 flex items-end">
                      {appointmentDetail && (() => {
                        const curDate = formatDateInput(appointmentDetail.attend_date);
                        const curStart = appointmentDetail.time ? appointmentDetail.time.substring(0, 5) : "";
                        const curEnd = appointmentDetail.end_time ? appointmentDetail.end_time.substring(0, 5) : "";
                        const fmtDate = (ymd: string) => {
                          const d = parse(ymd, "yyyy-MM-dd", new Date());
                          return isValid(d) ? format(d, "MMM d, yyyy") : ymd;
                        };
                        const timeRange = (s: string, e: string) =>
                          s ? (e ? `${formatTime(s)} – ${formatTime(e)}` : formatTime(s)) : "—";
                        const hasNew =
                          !!(rescheduleDate && rescheduleStartTime) &&
                          (rescheduleDate !== curDate || rescheduleStartTime !== curStart);
                        // Only show the summary once the patient has actually picked a new
                        // date/time — Current + New then appear together for comparison.
                        if (!hasNew) return null;
                        return (
                          // Both pills always stay on ONE row (text shrinks / ellipsises if tight)
                          // and match the Date field height (h-10).
                          <div className="w-full flex items-stretch gap-2 min-w-0">
                            <div className="flex-1 min-w-0 h-10 flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 px-2.5 text-xs">
                              <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 whitespace-nowrap">
                                <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" /> Current
                              </span>
                              <span className="text-border">|</span>
                              <span className="font-medium text-foreground whitespace-nowrap truncate">{fmtDate(curDate)} - {timeRange(curStart, curEnd)}</span>
                            </div>
                            <div className="flex items-center justify-center flex-shrink-0">
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0 h-10 flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/50 px-2.5 text-xs">
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 whitespace-nowrap">
                                <CalendarCheck className="h-3.5 w-3.5 flex-shrink-0" /> New
                              </span>
                              <span className="text-border">|</span>
                              <span className="font-medium text-foreground whitespace-nowrap truncate">{fmtDate(rescheduleDate)} - {timeRange(rescheduleStartTime, rescheduleEndTime)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Row 2: Available Times, full width */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Available Times</label>
                      {/* Available-time picker as buttons. The appointment's own current slot
                          (type "current") is shown as a distinct indigo "Booked" chip with a
                          tooltip; other occupied slots are hidden. End time is auto-derived in
                          handleRescheduleStartChange and sent in the payload. */}
                      {/* Loader shows ONLY while a day's slots are loading (options empty).
                          Picking a start keeps the grid visible so the modal doesn't resize. */}
                      {rescheduleSlotsLoading && rescheduleStartOptions.length === 0 ? (
                        <div className="flex items-center gap-2 h-10 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                      ) : (() => {
                        // Only show start times where the FULL required appointment duration is
                        // continuously available (point 4), and hide any start within the 24h
                        // reschedule lead time (point 5). The current appointment's own start is
                        // always shown as the "Booked" chip.
                        const duration = appointmentDetail
                          ? calculateDuration(
                              appointmentDetail.time.substring(0, 5),
                              appointmentDetail.end_time.substring(0, 5),
                            )
                          : 0;
                        const requiredBlocks = duration > 0 ? Math.max(1, Math.round(duration / 15)) : 1;
                        const availableMins = new Set(
                          rescheduleStartOptions
                            .filter((o) => o.type === "available" && !o.disabled)
                            .map((o) => timeToMinutes(o.value)),
                        );
                        const fitsDuration = (startMin: number) =>
                          Array.from({ length: requiredBlocks }, (_, i) => startMin + i * 15).every((t) =>
                            availableMins.has(t),
                          );
                        const visible = rescheduleStartOptions.filter((o) => {
                          if (o.type === "current") return true; // existing appointment → "Booked"
                          if (o.type !== "available" || o.disabled) return false;
                          const startMin = timeToMinutes(o.value);
                          return fitsDuration(startMin) && !isRescheduleTooSoon(rescheduleDate, o.value);
                        });
                        if (visible.length === 0) {
                          return <p className="text-sm text-muted-foreground py-2">No available times for this day.</p>;
                        }
                        return (
                          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
                            {visible.map((o) => {
                              const selected = o.value === rescheduleStartTime;
                              const isBooked = o.type === "current";
                              const btn = (
                                <button
                                  key={o.value}
                                  type="button"
                                  // The booked (current) slot is the active appointment — not
                                  // selectable; the cursor shows it can't be picked.
                                  aria-disabled={isBooked}
                                  onClick={() => {
                                    if (isBooked) return;
                                    setRescheduleErrors((prev) => ({ ...prev, startTime: undefined }));
                                    handleRescheduleStartChange(o.value);
                                  }}
                                  className={cn(
                                    "w-full h-10 flex items-center justify-center gap-1 rounded-lg border px-2 text-sm font-medium transition-colors",
                                    isBooked
                                      ? selected
                                        ? "border-indigo-500 bg-indigo-500 text-white cursor-not-allowed"
                                        : "border-indigo-300 bg-indigo-50 text-indigo-700 cursor-not-allowed"
                                      : selected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-card text-foreground hover:border-primary hover:bg-primary/5 hover:text-primary",
                                  )}
                                >
                                  {isBooked && <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />}
                                  {formatTime(o.value)}
                                </button>
                              );
                              return isBooked ? (
                                <Tooltip key={o.value}>
                                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                                  <TooltipContent>Your appointment is currently booked at this time</TooltipContent>
                                </Tooltip>
                              ) : (
                                btn
                              );
                            })}
                          </div>
                        );
                      })()}
                      {rescheduleErrors.startTime && (
                        <p className="text-xs text-destructive">{rescheduleErrors.startTime}</p>
                      )}
                  </div>

                  {/* Row 4: Reason for Reschedule */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Reason for Reschedule <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={rescheduleReason}
                      onChange={(e) => {
                        setRescheduleReason(e.target.value);
                        setRescheduleErrors((prev) => ({ ...prev, reason: undefined }));
                        // Clear the free-text field when switching away from "Other".
                        const picked = rescheduleReasons.find((r) => String(r.id) === e.target.value);
                        if ((picked?.reason ?? "").trim().toLowerCase() !== "other") {
                          setRescheduleOtherReason("");
                          setRescheduleErrors((prev) => ({ ...prev, otherReason: undefined }));
                        }
                      }}
                      className={cn(
                        "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-0 appearance-none",
                        rescheduleErrors.reason && "border-destructive",
                      )}
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                    >
                      <option value="">--Select Reason--</option>
                      {rescheduleReasons.map((r) => (
                        <option key={r.id} value={String(r.id)}>{r.reason}</option>
                      ))}
                    </select>
                    {rescheduleErrors.reason && (
                      <p className="text-xs text-destructive">{rescheduleErrors.reason}</p>
                    )}
                  </div>

                  {/* Free-text reason, shown only when "Other" is selected */}
                  {(rescheduleReasons.find((r) => String(r.id) === rescheduleReason)?.reason ?? "")
                    .trim().toLowerCase() === "other" && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-muted-foreground">
                        Please specify the reason <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={rescheduleOtherReason}
                        onChange={(e) => {
                          setRescheduleOtherReason(e.target.value);
                          setRescheduleErrors((prev) => ({ ...prev, otherReason: undefined }));
                        }}
                        placeholder="Enter other reason..."
                        className={cn(
                          "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0",
                          rescheduleErrors.otherReason && "border-destructive",
                        )}
                      />
                      {rescheduleErrors.otherReason && (
                        <p className="text-xs text-destructive">{rescheduleErrors.otherReason}</p>
                      )}
                    </div>
                  )}

                </>
              )}
            </div>
          )}

          {/* Fixed footer with a centered Re-Schedule button */}
          {rescheduleAppointment && !isModalLoading && (
            <div className="flex items-center justify-center pt-4 border-t border-border flex-shrink-0">
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={handleRescheduleSubmit}
                disabled={isRescheduleSubmitting || !rescheduleChanged}
              >
                {isRescheduleSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rescheduling…
                  </>
                ) : (
                  <>
                    <CalendarDays className="h-4 w-4 mr-1.5" />
                    Re-Schedule
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Visit Summary Modal */}
      <Dialog open={!!selectedVisit} onOpenChange={(open) => { if (!open) setSelectedVisit(null); }}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[900px] w-[90%] max-h-[90vh] p-5 gap-0 pointer-events-auto flex flex-col"
        >
          <DialogHeader className="pb-4 border-b border-border min-h-auto flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-xl font-semibold">
                {selectedVisit
                  ? `${selectedVisit.service_full_name ?? ""} ${selectedVisit.attend_type_full_name ?? ""}`.trim()
                  : ""}
              </DialogTitle>
              <button
                onClick={() => setSelectedVisit(null)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="py-4 overflow-auto">
            {selectedVisit && (() => {
              // The status badge comes from `attend_status` (the real state), NOT
              // `appt_status` — the API hardcodes that to "Confirmed" on every row,
              // so it would label a cancelled visit "Confirmed".
              const statusLabel = appointmentStatusOf({
                attend_status: selectedVisit.attend_status as string | null | undefined,
              });
              const TOP_KEYS = ["is_virtual_text", "department"];
              // `appt_status` is hidden (always "Confirmed", misleading); `attend_status`
              // is hidden because the status badge above now shows it as a proper label
              // rather than the raw code ("S").
              const HIDDEN_KEYS = ["id", "ma_id", "provider_id", "is_virtual", "clinical_note", "appt_status", "attend_status"];
              const topEntries = TOP_KEYS
                .map((k) => ({ key: k, value: selectedVisit[k] }))
                .filter(({ value }) => value !== null && value !== undefined && value !== "");
              const cardEntries = Object.entries(selectedVisit).filter(([k]) => !TOP_KEYS.includes(k) && !HIDDEN_KEYS.includes(k));

              return (
                <>
                  {(statusLabel || topEntries.length > 0) && (
                    <div className="flex flex-wrap gap-2 mb-5">
                      {statusLabel && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-medium",
                            APPOINTMENT_STATUS_STYLES[statusLabel] ?? UNKNOWN_TAG_STYLE,
                          )}
                        >
                          {/* bg-current: the dot inherits the status tint, so it can't
                              go stale the way the previously hardcoded green one did. */}
                          <span className="w-2 h-2 rounded-full bg-current opacity-70 flex-shrink-0" />
                          {statusLabel}
                        </span>
                      )}
                      {topEntries.map(({ key, value }) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-background text-sm font-medium text-foreground"
                        >
                          {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cardEntries.map(([key, value]) => (
                      <div
                        key={key}
                        className="rounded-lg bg-muted/50 px-4 py-3"
                      >
                        <p className="text-sm font-bold text-foreground mb-0.5">
                          {formatKey(key)}
                        </p>
                        <p className="text-sm font-normal text-muted-foreground break-words">
                          {value !== null && value !== undefined && value !== ""
                            ? key === "clinical_note"
                              ? (() => {
                                const raw = String(value);
                                const filename = raw.split(/[\\/]/).pop() || raw;
                                return filename;
                              })()
                              : /^\d{4}-\d{2}-\d{2}/.test(String(value))
                                ? formatDate(String(value))
                                : String(value)
                            : key === "clinical_note" ? "No file available" : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* 24h lead-time guard for rescheduling (mirrors the booking flow) */}
      <BookingTooSoonModal
        open={showRescheduleTooSoon}
        onClose={() => setShowRescheduleTooSoon(false)}
        title={RESCHEDULE_TOO_SOON_TITLE}
        message={RESCHEDULE_TOO_SOON_MESSAGE}
      />
      {/* 24h lead-time guard for cancelling (mirrors the reschedule flow) */}
      <BookingTooSoonModal
        open={showCancelTooSoon}
        onClose={() => setShowCancelTooSoon(false)}
        title={CANCEL_TOO_SOON_TITLE}
        message={CANCEL_TOO_SOON_MESSAGE}
      />
      <SlotTooShortModal
        open={slotTooShortInfo !== null}
        onClose={() => setSlotTooShortInfo(null)}
        availableLabel={slotTooShortInfo?.available ?? ""}
        requiredLabel={slotTooShortInfo?.required ?? ""}
      />

      {/* Cancel Appointment modal */}
      <Dialog open={isCancelOpen} onOpenChange={(o) => { if (!o) closeCancelModal(); }}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[560px] w-[90%] p-5 gap-0"
          onAnimationEnd={() => { if (!isCancelOpen) { setCancelAppointmentRow(null); setCancelDetail(null); } }}
        >
          <DialogHeader className="pb-4 border-b border-border min-h-auto">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-xl font-semibold">
                Cancel Appointment
                {cancelAppointmentRow && (
                  <span className="font-normal text-muted-foreground">
                    {" – "}{cancelAppointmentRow.provider_name}
                  </span>
                )}
              </DialogTitle>
              <button
                onClick={closeCancelModal}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          {isCancelLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            cancelAppointmentRow && (
              <div className="py-5 space-y-5">
                {/* Reason for Cancellation */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-muted-foreground">
                    Reason for Cancellation <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={cancelReason}
                    onChange={(e) => {
                      setCancelReason(e.target.value);
                      setCancelErrors((prev) => ({ ...prev, reason: undefined }));
                      const picked = rescheduleReasons.find((r) => String(r.id) === e.target.value);
                      if ((picked?.reason ?? "").trim().toLowerCase() !== "other") {
                        setCancelOtherReason("");
                        setCancelErrors((prev) => ({ ...prev, otherReason: undefined }));
                      }
                    }}
                    className={cn(
                      "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-0 appearance-none",
                      cancelErrors.reason && "border-destructive",
                    )}
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                  >
                    <option value="">--Select Reason--</option>
                    {rescheduleReasons.map((r) => (
                      <option key={r.id} value={String(r.id)}>{r.reason}</option>
                    ))}
                  </select>
                  {cancelErrors.reason && (
                    <p className="text-xs text-destructive">{cancelErrors.reason}</p>
                  )}
                </div>

                {/* Free-text reason, shown only when "Other" is selected */}
                {(rescheduleReasons.find((r) => String(r.id) === cancelReason)?.reason ?? "")
                  .trim().toLowerCase() === "other" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-muted-foreground">
                      Please specify the reason <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={cancelOtherReason}
                      onChange={(e) => {
                        setCancelOtherReason(e.target.value);
                        setCancelErrors((prev) => ({ ...prev, otherReason: undefined }));
                      }}
                      placeholder="Enter other reason..."
                      className={cn(
                        "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0",
                        cancelErrors.otherReason && "border-destructive",
                      )}
                    />
                    {cancelErrors.otherReason && (
                      <p className="text-xs text-destructive">{cancelErrors.otherReason}</p>
                    )}
                  </div>
                )}

              </div>
            )
          )}

          {/* ── Modal footer ── */}
          {!isCancelLoading && cancelAppointmentRow && (
            <div className="pt-4 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={closeCancelModal} disabled={isCancelSubmitting}>
                Keep Appointment
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90"
                disabled={isCancelSubmitting || !cancelDetail}
                onClick={handleCancelSubmit}
              >
                {isCancelSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Cancel Appointment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

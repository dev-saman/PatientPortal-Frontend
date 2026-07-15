import { useState, useEffect, useCallback, useMemo, useRef, type ComponentProps } from "react";
import {
  Clock,
  MapPin,
  Video,
  CalendarDays,
  X,
  Loader2,
  Plus,
} from "lucide-react";
import PageLoader from "@/components/PageLoader";
import ScheduleAppointmentModal from "@/components/ScheduleAppointmentModal";
import SelectPreauthorizationModal, { type PreauthRecord, preauthState } from "@/components/SelectPreauthorizationModal";
import ActivationRequiredModal from "@/components/ActivationRequiredModal";
import BookingTooSoonModal from "@/components/BookingTooSoonModal";
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

const APPOINTMENT_STATUS_STYLES: Record<string, string> = {
  Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  "Action Required": "bg-amber-50 text-amber-700 border-amber-200",
};

const APPOINTMENT_VISIT_TYPE_STYLES: Record<string, string> = {
  "In-Person": "bg-purple-50 text-purple-700 border-purple-200",
  Telehealth: "bg-green-50 text-green-700 border-green-200",
};

const renderAppointmentTag = (
  value: string | null | undefined,
  stylesMap: Record<string, string>
) => {
  if (!value) return null;
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  const tagClassName = stylesMap[normalizedValue];
  if (!tagClassName) return null;

  return (
    <Badge variant="outline" className={tagClassName}>
      {normalizedValue}
    </Badge>
  );
};

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

// Tag every option in the appointment's own window [rangeStart, rangeEnd) as
// `current` (selectable) so the whole current span reads "– Current" instead of
// the anonymized "– Not Available" — the appointment's own booked slots come back
// as `type:"booked"`. Ensures `rangeStart` is present even if the API omitted it.
const withCurrentRange = (
  options: SlotOption[],
  rangeStart: string,
  rangeEnd: string,
): SlotOption[] => {
  if (!rangeStart) return options;
  const lo = timeToMinutes(rangeStart);
  const hi = rangeEnd ? timeToMinutes(rangeEnd) : lo + 1;
  const marked = options.map((o) => {
    const t = timeToMinutes(o.value);
    return t >= lo && t < hi ? { ...o, type: "current", disabled: false } : o;
  });
  if (!marked.some((o) => o.value === rangeStart)) {
    return [{ value: rangeStart, label: formatTime(rangeStart), disabled: false, type: "current" }, ...marked];
  }
  return marked;
};

// Occupied slot types (booked / cross-location booked / blocked / cross-location
// blocked). Mirrors ScheduleAppointmentModal: the patient must not learn whether a
// slot is booked, blocked, or booked at another location.
const OCCUPIED_SLOT_TYPES = new Set([
  "booked",
  "cross_location_booked",
  "blocked",
  "blocked_cross_location",
]);

// Display label for a Start/End time option. The appointment's own slot is shown as
// "<time> – Current"; occupied slots are shown generically as "<time> – Not Available"
// (their backend reason is stripped); every other type — holiday, provider-on-leave,
// lunch, available — keeps its backend label.
const slotDisplayLabel = (o: SlotOption): string => {
  const clean = o.label.replace(/\s*\(.*\)\s*$/, "").trim();
  if (o.type === "current") return `${clean} – Current`;
  return OCCUPIED_SLOT_TYPES.has(o.type) ? `${clean} – Not Available` : o.label;
};

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

  // The pre-auth service-window restriction only applies to appointments booked
  // via a pre-auth (`made_via === "preauth"`). Any other booking may be moved to
  // any future date, so its calendar is bounded by today only. `made_via` and the
  // window dates are authoritative on the get-appointment detail; fall back to the
  // list row only if the detail hasn't loaded yet.
  const rescheduleMinDate = useMemo(() => {
    const today = startOfDay(new Date());
    const src = appointmentDetail ?? rescheduleAppointment;
    if (String(src?.made_via ?? "").toLowerCase() !== "preauth") return today;
    const startStr = src?.svc_date_start;
    if (!startStr) return today;
    const start = parse(formatDateInput(startStr), "yyyy-MM-dd", new Date());
    return isValid(start) && start > today ? start : today;
  }, [appointmentDetail, rescheduleAppointment]);

  // Latest selectable reschedule date: the pre-auth window's end. `ext_date`
  // (extension) takes precedence over `svc_date_end` when present. Undefined
  // (no upper bound) for non-pre-auth appointments or when there is no window.
  const rescheduleMaxDate = useMemo(() => {
    const src = appointmentDetail ?? rescheduleAppointment;
    if (String(src?.made_via ?? "").toLowerCase() !== "preauth") return undefined;
    const endStr = src?.ext_date || src?.svc_date_end;
    if (!endStr) return undefined;
    const end = parse(formatDateInput(endStr), "yyyy-MM-dd", new Date());
    return isValid(end) ? end : undefined;
  }, [appointmentDetail, rescheduleAppointment]);

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
    setRescheduleSlotsLoading(true);
    // Start options come from the provider's real schedule for this date + location.
    const starts = await fetchRescheduleStartsForDate(detail, date);
    setRescheduleSlotsLoading(false);
    setRescheduleStartOptions(withCurrentRange(starts, start, end));
  };

  // Date changed: immediately load the provider's real Start-time options for that
  // date + the appointment's location (via get-time-slots-date-range — no fixed
  // start_time, so no "start_time is outside provider schedule" error). Start/End
  // reset to unselected; the user then picks a start.
  const handleRescheduleDateChange = async (ymd: string) => {
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
    setRescheduleDate(ymd);
    setRescheduleStartTime("");
    setRescheduleEndTime("");
    setRescheduleErrors((prev) => ({ ...prev, startTime: undefined }));
    const detail = appointmentDetail;
    if (!detail || !ymd) {
      setRescheduleStartOptions([]);
      return;
    }
    setRescheduleSlotsLoading(true);
    const starts = await fetchRescheduleStartsForDate(detail, ymd);
    setRescheduleSlotsLoading(false);
    // Mark the current window "– Current" only on the appointment's own date.
    const isOriginalDate = ymd === formatDateInput(detail.attend_date);
    setRescheduleStartOptions(
      isOriginalDate
        ? withCurrentRange(starts, detail.time.substring(0, 5), detail.end_time.substring(0, 5))
        : starts,
    );
  };

  // Start time changed: set End = Start + the appointment's required duration, and
  // reject the pick if that full span isn't available (overlaps a later booking).
  const handleRescheduleStartChange = async (value: string) => {
    // Block selecting a slot less than 24h away; keep the previous selection.
    if (value && isRescheduleTooSoon(rescheduleDate, value)) {
      setShowRescheduleTooSoon(true);
      return;
    }
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
    // Defensive 24h lead-time re-check: the too-soon appointment is already blocked
    // at open, and slot selection is guarded, but this covers a newly picked date/time
    // that lands less than 24h away before submit.
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
                const isVirtual =
                  appointment.is_virtual_text?.toLowerCase() === "telehealth" ||
                  appointment.attend_type?.toLowerCase().includes("virtual") ||
                  appointment.attend_type?.toLowerCase().includes("telehealth");

                return (
                  <Card key={appointment.id || index} className="shadow-soft border-l-4 border-l-primary">
                    <CardContent className="p-6">
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
                                {renderAppointmentTag(appointment.appt_status, APPOINTMENT_STATUS_STYLES)}
                                {renderAppointmentTag(appointment.is_virtual_text, APPOINTMENT_VISIT_TYPE_STYLES)}
                              </div>
                              <h3 className="text-xl font-bold">
                                {appointment.service_full_name} {appointment.attend_type_full_name}
                              </h3>
                              <p className="text-muted-foreground">with {appointment.provider_name}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
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


                          <div className="flex flex-wrap gap-3 pt-2">
                            {/* <Button className="bg-primary hover:bg-primary/90">
                            eCheck-In
                          </Button> */}
                            <Button variant="outline" onClick={() => openRescheduleModal(appointment)}>
                              Reschedule
                            </Button>
                            {/* <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            Cancel
                          </Button> */}
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
          className="!max-w-[980px] w-[90%] max-h-[90vh] p-5 gap-0 pointer-events-auto flex flex-col"
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
            <div className="py-5 space-y-5 overflow-auto">
              {isModalLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Row 1: Location | Speciality/Service Type | Physician */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Location</label>
                      <input
                        readOnly
                        value={rescheduleAppointment.department || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Speciality/Service Type</label>
                      <input
                        readOnly
                        value={
                          appointmentDetail?.service
                            ? `${appointmentDetail.service.toUpperCase()} (${rescheduleAppointment.service_full_name})`
                            : rescheduleAppointment.service_full_name || "—"
                        }
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Physician</label>
                      <input
                        readOnly
                        value={rescheduleAppointment.provider_name || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Row 2: Visit Type | Visit Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Visit Type</label>
                      <input
                        readOnly
                        value={
                          rescheduleAppointment.attend_type
                            ? `${rescheduleAppointment.attend_type.toUpperCase()} (${rescheduleAppointment.attend_type_full_name})`
                            : rescheduleAppointment.attend_type_full_name || "—"
                        }
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Visit Status</label>
                      <input
                        readOnly
                        value={rescheduleAppointment.appt_status || rescheduleAppointment.status || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Row 3: Date | Start Time | End Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
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
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Start Time</label>
                      <select
                        disabled={rescheduleSlotsLoading}
                        value={rescheduleStartTime}
                        onChange={(e) => {
                          setRescheduleErrors((prev) => ({ ...prev, startTime: undefined }));
                          handleRescheduleStartChange(e.target.value);
                        }}
                        className={cn(
                          "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-0 appearance-none disabled:cursor-default disabled:bg-muted",
                          rescheduleErrors.startTime && "border-destructive",
                        )}
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                      >
                        {rescheduleStartOptions.length === 0 ? (
                          <option value="">{rescheduleSlotsLoading ? "Loading…" : "Not Available"}</option>
                        ) : (
                          <option value="">Select Start Time</option>
                        )}
                        {rescheduleStartOptions.map((o) => (
                          <option key={o.value} value={o.value} disabled={o.disabled}>
                            {slotDisplayLabel(o)}
                          </option>
                        ))}
                      </select>
                      {rescheduleErrors.startTime && (
                        <p className="text-xs text-destructive">{rescheduleErrors.startTime}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">End Time</label>
                      {/* Read-only: End is always Start + the appointment's required
                          duration; the user picks only the Start Time. */}
                      <input
                        readOnly
                        value={
                          rescheduleSlotsLoading
                            ? "Loading…"
                            : rescheduleEndTime
                              ? formatTime(rescheduleEndTime)
                              : "—"
                        }
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Row 4: Reason for Reschedule */}
                  <div className="flex flex-col gap-1.5">
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
                    <div className="flex flex-col gap-1.5">
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

                  {/* Re-Schedule button */}
                  <div className="flex justify-center pt-2 w-50 mx-auto">
                    <Button
                      className="bg-primary hover:bg-primary/90 px-1 w-full"
                      disabled={isRescheduleSubmitting}
                      onClick={handleRescheduleSubmit}
                    >
                      {isRescheduleSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarDays className="h-4 w-4" />
                      )}
                      Re-Schedule
                    </Button>
                  </div>
                </>
              )}
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
              const TOP_KEYS = ["appt_status", "is_virtual_text", "department"];
              const HIDDEN_KEYS = ["id", "ma_id", "provider_id", "is_virtual", "clinical_note"];
              const topEntries = TOP_KEYS
                .map((k) => ({ key: k, value: selectedVisit[k] }))
                .filter(({ value }) => value !== null && value !== undefined && value !== "");
              const cardEntries = Object.entries(selectedVisit).filter(([k]) => !TOP_KEYS.includes(k) && !HIDDEN_KEYS.includes(k));

              return (
                <>
                  {topEntries.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-5">
                      {topEntries.map(({ key, value }) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-background text-sm font-medium text-foreground"
                        >
                          {key === "appt_status" && (
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          )}
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
      <SlotTooShortModal
        open={slotTooShortInfo !== null}
        onClose={() => setSlotTooShortInfo(null)}
        availableLabel={slotTooShortInfo?.available ?? ""}
        requiredLabel={slotTooShortInfo?.required ?? ""}
      />
    </div>
  );
}

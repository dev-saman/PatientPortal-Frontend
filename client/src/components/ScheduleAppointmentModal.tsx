import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Trash2, CalendarDays, CalendarCheck, CalendarClock, Loader2, AlertCircle, Check, MapPin, Stethoscope, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { getActivePatientId } from "@/lib/caseContext";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type { PreauthRecord } from "@/components/SelectPreauthorizationModal";
import SlotTooShortModal from "@/components/SlotTooShortModal";

interface Department {
  id: number | string;
  name: string;
}

interface SpecialityGroup {
  id: number;
  short_name: string;
  name: string;
  physicians: { physician_id: number; physician_name: string; speciality_short: string; [key: string]: any }[];
  visit_types: { visittype_id: number; visittype_name: string; visittype_code: string; [key: string]: any }[];
  [key: string]: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The active preauthorization selected on the Appointments page. All
   *  scheduling actions are performed in the context of this preauth. */
  preauth: PreauthRecord | null;
  /** Called after at least one appointment is booked successfully, so the
   *  Appointments page can refetch and show the new visit(s). */
  onScheduled?: () => void;
}

interface CompanyOption {
  amd_company_name: string;
  amd_code: string;
  [key: string]: any;
}

// Case-insensitive, trimmed equality for matching preauth values against loaded
// dropdown options. Both sides are coerced to string so numeric ids compare too.
const eqCi = (a: unknown, b: unknown): boolean => {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
};

// Default appointment length (minutes) used when the backend does not return a
// visit-type `duration_minutes` (e.g. no visit type resolved yet).
const DEFAULT_DURATION_MIN = 60;

// Non-standard short day names to mirror the Medhiwa reference grid headers.
const SHORT_DAY = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parse a 12-hour label like "8:00 AM" into minutes since midnight.
const timeToMinutes = (label: string): number => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(label).trim());
  if (!m) return NaN;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
};

// Format minutes since midnight back into a 12-hour label ("8:15 AM").
const minutesToLabel = (min: number): string => {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
};

// Format a 24h "HH:MM[:SS]" time (as returned in preauth.appointments) to "8:30 AM".
const time24ToLabel = (t: string): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return t;
  return minutesToLabel(parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
};

// Human-readable duration from minutes: 15 → "15 minutes", 60 → "1 hour",
// 150 → "2 hours 30 minutes". Used in the "slot too short" message.
const formatDuration = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" ") : "0 minutes";
};

// Local YYYY-MM-DD for a Date (no UTC shift), matching the backend date keys.
const toYMD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Short header label ("Tues, Jul 14") from a YYYY-MM-DD string.
const formatDayHeader = (ymd: string): string => {
  const d = new Date(ymd + "T00:00:00");
  return `${SHORT_DAY[d.getDay()]}, ${SHORT_MONTH[d.getMonth()]} ${d.getDate()}`;
};

// Three-letter weekday ("Mon", "Tue", "Wed").
const shortWeekday = (ymd: string): string => {
  const d = new Date(ymd + "T00:00:00");
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
};

// Compact day-pill label: 3-letter weekday + month/day ("Mon, Jul 27").
const formatDayPill = (ymd: string): string => {
  const d = new Date(ymd + "T00:00:00");
  return `${shortWeekday(ymd)}, ${SHORT_MONTH[d.getMonth()]} ${d.getDate()}`;
};

// Add `days` calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD.
const addDays = (ymd: string, days: number): string => {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toYMD(d);
};

// One page = a 7-calendar-day window. Since the backend omits weekends, any 7
// consecutive calendar days contain exactly 5 working days → 5 grid columns.
const PAGE_WINDOW_DAYS = 7;
// Data is fetched in larger BLOCKS to minimise API calls: one request covers
// BLOCK_PAGES pages, then the grid slices it into 5-day pages client-side (so
// navigating within a block is instant). BLOCK_PAGES × 7 calendar days always
// yields BLOCK_PAGES × 5 working days (weekends dropped). The next block is
// prefetched in the background so crossing blocks shows no loading screen.
const BLOCK_PAGES = 3;
const BLOCK_WINDOW_DAYS = BLOCK_PAGES * PAGE_WINDOW_DAYS; // 21 calendar days ≈ 15 working days
const PAGE_COLUMNS = 5; // working-day columns per page

interface TimeSlot {
  time: string;
  is_lunch: boolean;
  type: string;
  disabled: boolean;
  cross_location?: string | null;
  is_cross_telemed?: boolean;
  department?: string | null;
  reason?: string | null;
}

interface DateSlots {
  date: string;
  day_name: string;
  is_holiday?: boolean;
  holiday_name?: string | null;
  // Day-level availability from the backend (get-time-slots-date-range). A closed
  // day arrives with is_available:false + an unavailable_reason and empty slots.
  is_available?: boolean;
  unavailable_reason?: string | null;
  slots: TimeSlot[];
}

// One selected appointment, keyed by date (YYYY-MM-DD). Times are 12h labels.
interface DaySelection {
  startTime: string;
  endTime: string;
  transport: boolean;
  virtual: boolean;
}

export default function ScheduleAppointmentModal({ open, onClose, preauth, onScheduled }: Props) {
  const { user } = useAuth();
  // One confirmed appointment per day, keyed by date (YYYY-MM-DD).
  const [selectedByDay, setSelectedByDay] = useState<Record<string, DaySelection>>({});
  const [page, setPage] = useState(1);
  // Day currently focused in the day-pill strip (YYYY-MM-DD). Defaulted/kept-valid
  // by an effect whenever the visible page of dates changes.
  const [activeDate, setActiveDate] = useState<string>("");
  // Remaining authorized sessions (denominator of the counter), from check-sessions-completed.
  const [sessionLimit, setSessionLimit] = useState(0);
  // Appointment length in minutes, from the backend `duration_minutes` (visit-type based).
  const [slotDuration, setSlotDuration] = useState(DEFAULT_DURATION_MIN);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");

  const [specialityGroups, setSpecialityGroups] = useState<SpecialityGroup[]>([]);
  const [specialityLoading, setSpecialityLoading] = useState(false);
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedVisitType, setSelectedVisitType] = useState("");

  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");

  // Single modal-level loader: true until departments + speciality + company all resolve
  const [isModalLoading, setIsModalLoading] = useState(false);
  // Tracks how many async operations are still in-flight during initial load
  const pendingInitRef = useRef(0);

  // When sessions are already completed, show only this message (hides all form content)
  const [sessionsBlockMessage, setSessionsBlockMessage] = useState<string | null>(null);

  // True while the Schedule button is submitting the booking(s)
  const [submitting, setSubmitting] = useState(false);


  // Set when the patient picks a slot without enough continuous availability for the
  // required appointment length (null = closed). Holds the labels for the message.
  const [tooShortInfo, setTooShortInfo] = useState<{ available: string; required: string } | null>(null);

  // Populated from the selected preauth record (passed in via the `preauth` prop)
  const [svcDateStart, setSvcDateStart] = useState("");
  const [svcDateEnd, setSvcDateEnd] = useState("");
  const [preauthCaseId, setPreauthCaseId] = useState("");
  // ma_id of the selected preauth — needed for check-sessions-completed and for
  // the appointment-schedule call (path is case_id/ma_id/patient_id)
  const [preauthMaId, setPreauthMaId] = useState<string | number>("");

  // Time slots fetched lazily in BLOCKS (block index → that block's working days).
  // A block is one API request covering several pages; the grid slices it into 5-day
  // pages client-side. Loaded blocks are cached, and the next block is prefetched in
  // the background, so navigation rarely shows a loading screen.
  const [blockCache, setBlockCache] = useState<Record<number, DateSlots[]>>({});
  const blockCacheRef = useRef<Record<number, DateSlots[]>>({});
  const inFlightBlocksRef = useRef<Set<number>>(new Set());
  // Bumped on every query reset; in-flight fetches from a previous query are
  // discarded on resolve so a stale response never overwrites fresh data.
  const loadGenerationRef = useRef(0);
  const [timeSlotsError, setTimeSlotsError] = useState<string | null>(null);

  // Find the group whose short_name matches the selected speciality
  const selectedGroup = specialityGroups.find((g) => g.short_name === selectedSpeciality) ?? null;

  const fetchCompanyData = (department: string, physicianId: number | string, isInit = false) => {
    if (!department || !physicianId) return;
    if (!isInit) setIsModalLoading(true);
    setCompanyOptions([]);
    setSelectedCompany("");
    setSelectedProviderId("");
    Apis.getCompanyByDepartmentAndProvider(department, physicianId)
      .then((data: any) => {
        if (!data.success) {
          toast.error(data.message || data.error || "Failed to load company data");
          return;
        }
        const raw = data.companies ?? data.data ?? [];
        const list: CompanyOption[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
        setCompanyOptions(list);
        if (list.length > 0) {
          // On initial open, preselect the preauth's company; else the first option.
          const matchedCompany =
            isInit && preauth?.referred_company_name
              ? list.find((c) => eqCi(c.amd_company_name, preauth.referred_company_name))
              : undefined;
          const company = matchedCompany ?? list[0];
          setSelectedCompany(company.amd_company_name);
          setSelectedProviderId(company.amd_code);
        }
      })
      .catch((error) => {
        toast.error(getApiErrorMessage(error));
      })
      .finally(() => {
        if (!isInit) setIsModalLoading(false);
        if (isInit) {
          pendingInitRef.current -= 1;
          if (pendingInitRef.current <= 0) setIsModalLoading(false);
        }
      });
  };

  const applyFirstSelections = (groups: SpecialityGroup[], department: string, isInit = false) => {
    const firstGroup = groups.find((g) => g.physicians.length > 0);
    if (!firstGroup) {
      if (isInit) {
        pendingInitRef.current -= 1;
        if (pendingInitRef.current <= 0) setIsModalLoading(false);
      }
      return;
    }
    // On initial open, preselect the values from the selected preauth; fall back to
    // the first available option whenever the preauth value is missing or absent from
    // the loaded lists. Manual (non-init) changes always cascade to the first option.
    const group =
      (isInit && preauth?.service
        ? groups.find((g) => g.physicians.length > 0 && eqCi(g.short_name, preauth.service))
        : undefined) ?? firstGroup;
    const physician =
      (isInit && preauth
        ? group.physicians.find((p) => eqCi(p.physician_id, preauth.physician_id)) ??
          group.physicians.find((p) => eqCi(p.physician_name, preauth.referred_by_physician))
        : undefined) ?? group.physicians[0];
    const visitType =
      (isInit && preauth?.visit_type
        ? group.visit_types?.find((vt) => eqCi(vt.visittype_code, preauth.visit_type))
        : undefined) ?? group.visit_types?.[0];

    setSelectedSpeciality(group.short_name);
    setSelectedProvider(physician?.physician_name ?? "");
    setSelectedVisitType(visitType?.visittype_code ?? "");
    if (physician?.physician_id) {
      fetchCompanyData(department, physician.physician_id, isInit);
    } else if (isInit) {
      pendingInitRef.current -= 1;
      if (pendingInitRef.current <= 0) setIsModalLoading(false);
    }
  };

  const fetchSpecialityData = (location: string, isInit = false) => {
    if (!location) return;
    if (!isInit) setSpecialityLoading(true);
    setSpecialityGroups([]);
    setSelectedSpeciality("");
    setSelectedProvider("");
    setSelectedVisitType("");
    setCompanyOptions([]);
    setSelectedCompany("");
    setSelectedProviderId("");
    Apis.getDepartmentSpecialityWithPhysician(location)
      .then((data: any) => {
        if (!data.success) {
          toast.error(data.message || data.error || "Failed to load speciality data");
          return;
        }
        const groups: SpecialityGroup[] = Array.isArray(data.data)
          ? data.data
          : data.data
          ? [data.data]
          : [];
        setSpecialityGroups(groups);
        applyFirstSelections(groups, location, isInit);
      })
      .catch((error) => {
        toast.error(getApiErrorMessage(error));
        if (isInit) {
          pendingInitRef.current -= 1;
          if (pendingInitRef.current <= 0) setIsModalLoading(false);
        }
      })
      .finally(() => {
        if (!isInit) setSpecialityLoading(false);
      });
  };

  useEffect(() => {
    if (!open) return;

    setSessionsBlockMessage(null);
    setSvcDateStart("");
    setSvcDateEnd("");
    setPreauthCaseId("");
    setPreauthMaId("");
    loadGenerationRef.current += 1;
    blockCacheRef.current = {};
    inFlightBlocksRef.current = new Set();
    setBlockCache({});
    setPage(1);
    setTimeSlotsError(null);
    setSelectedByDay({});
    setSessionLimit(0);
    setTooShortInfo(null);
    setIsModalLoading(true);

    // Helper: load departments → speciality → company once preauth checks pass
    const loadFormData = () => {
      pendingInitRef.current = 2; // departments → speciality → company (company counts as 1 of the 2 deferred)
      setDepartmentsLoading(true);
      Apis.getAppointmentDepartments()
        .then((data: any) => {
          if (!data.success) {
            toast.error(data.message || data.error || "Failed to load departments");
            setIsModalLoading(false);
            return;
          }
          const raw: any[] = data.data || data.departments || [];
          const list: Department[] = raw.map((d: any) =>
            typeof d === "string"
              ? { id: d, name: d }
              : { id: d.id ?? d.department_id ?? d.value ?? d.name, name: d.name ?? d.department_name ?? d.label }
          );
          setDepartments(list);
          if (list.length > 0) {
            // Preselect the preauth's facility; fall back to the first department.
            const matchedDept = preauth?.medauth_facility
              ? list.find((d) => eqCi(d.name, preauth.medauth_facility))
              : undefined;
            const initialId = String((matchedDept ?? list[0]).id);
            setSelectedLocation(initialId);
            pendingInitRef.current -= 1;
            fetchSpecialityData(initialId, true);
          } else {
            setIsModalLoading(false);
          }
        })
        .catch((error) => {
          toast.error(getApiErrorMessage(error));
          setIsModalLoading(false);
        })
        .finally(() => {
          setDepartmentsLoading(false);
        });
    };

    // The active preauth is selected on the Appointments page and passed in via
    // the `preauth` prop. If it is missing there is nothing to schedule against.
    if (!preauth) {
      setIsModalLoading(false);
      return;
    }

    // Step 1: Source scheduling context from the selected preauth record
    const caseId = String(preauth.case_id ?? "");
    const maId = preauth.ma_id ?? "";
    setPreauthCaseId(caseId);
    setPreauthMaId(maId);
    if (preauth.svc_date_start) setSvcDateStart(String(preauth.svc_date_start));
    if (preauth.svc_date_end) setSvcDateEnd(String(preauth.svc_date_end));

    // Step 2: Check Sessions Completed for the selected preauth
    Apis.checkSessionsCompleted(caseId, maId)
      .then((checkData: any) => {
        if (checkData?.success === false) {
          // Show only the message; hide all form content
          setSessionsBlockMessage(checkData.message ?? "Sessions already completed.");
          setIsModalLoading(false);
          return;
        }
        // Remaining authorized sessions drives the "confirmed / remaining" counter
        // and the per-session selection limit.
        setSessionLimit(Number(checkData?.sessions_remaining ?? 0));
        // success: true — proceed with normal form loading
        loadFormData();
      })
      .catch(() => {
        // If the sessions check fails, fall through to normal form loading
        loadFormData();
      });
  }, [open, preauth]);

  // Derive physician_id for the currently selected provider
  const selectedPhysicianId = selectedGroup?.physicians.find(
    (p) => p.physician_name === selectedProvider
  )?.physician_id ?? null;

  // Earliest schedulable date: later of today and the pre-auth window start. Page 1
  // starts here; each subsequent page is another PAGE_WINDOW_DAYS-day window.
  const scheduleRangeStart = useMemo(() => {
    if (!svcDateStart) return "";
    const today = toYMD(new Date());
    return svcDateStart >= today ? svcDateStart : today;
  }, [svcDateStart]);

  // Fetch one block's window (BLOCK_PAGES pages) via a single API call and cache it.
  // `background: true` prefetches without showing the page loader. Already-loaded or
  // in-flight blocks are skipped. `blockIndex` is 0-based.
  const loadBlock = useCallback(
    async (blockIndex: number, background = false) => {
      if (blockIndex < 0) return;
      if (!selectedLocation || !selectedPhysicianId || !scheduleRangeStart || !svcDateEnd || !preauthCaseId) return;
      if (blockCacheRef.current[blockIndex] || inFlightBlocksRef.current.has(blockIndex)) return;
      const winStart = addDays(scheduleRangeStart, BLOCK_WINDOW_DAYS * blockIndex);
      if (winStart > svcDateEnd) {
        blockCacheRef.current = { ...blockCacheRef.current, [blockIndex]: [] };
        setBlockCache(blockCacheRef.current);
        return;
      }
      const rawEnd = addDays(winStart, BLOCK_WINDOW_DAYS - 1);
      const winEnd = rawEnd <= svcDateEnd ? rawEnd : svcDateEnd;
      inFlightBlocksRef.current.add(blockIndex);
      if (!background) setTimeSlotsError(null);
      const gen = loadGenerationRef.current;
      try {
        const data: any = await Apis.getTimeSlotDateRange(
          selectedPhysicianId,
          selectedLocation,
          winStart,
          winEnd,
          preauthCaseId,
          selectedVisitType,
          selectedSpeciality,
        );
        if (gen !== loadGenerationRef.current) return; // query changed — discard stale response
        if (!data.status) {
          if (!background) setTimeSlotsError(data.message || "Failed to load time slots");
          return;
        }
        // Visit-type appointment length; fall back to the default when absent.
        const dur = Number(data.duration_minutes);
        setSlotDuration(Number.isFinite(dur) && dur > 0 ? dur : DEFAULT_DURATION_MIN);
        const dates: DateSlots[] = Array.isArray(data.dates) ? data.dates : [];
        blockCacheRef.current = { ...blockCacheRef.current, [blockIndex]: dates };
        setBlockCache(blockCacheRef.current);
      } catch {
        if (gen === loadGenerationRef.current && !background) setTimeSlotsError("Failed to load time slots");
      } finally {
        inFlightBlocksRef.current.delete(blockIndex);
      }
    },
    [selectedLocation, selectedPhysicianId, scheduleRangeStart, svcDateEnd, preauthCaseId, selectedVisitType, selectedSpeciality],
  );

  // Reset the cache + selections whenever the query changes (location / provider /
  // dates / visit type / speciality). `loadBlock`'s identity changes with exactly those
  // inputs, so depending on it covers all of them. Blocks are then (re)loaded lazily by
  // the "ensure enough days for the current page" effect further down.
  useEffect(() => {
    loadGenerationRef.current += 1;
    blockCacheRef.current = {};
    inFlightBlocksRef.current = new Set();
    setBlockCache({});
    setSelectedByDay({});
    setTimeSlotsError(null);
    setPage(1);
  }, [loadBlock]);

  // Navigate pages. Days are paginated 5-at-a-time from a flat list of all loaded blocks
  // (see below), so a page is always exactly PAGE_COLUMNS days whenever data exists.
  const goToPage = (pageNum: number) => {
    if (pageNum < 1) return;
    setPage(pageNum);
  };

  const selectedCount = Object.keys(selectedByDay).length;

  // Dates the patient has ALREADY booked under this preauth (patient-scoped, from
  // get-approved-preauth → preauth.appointments.upcoming_appt), keyed by YYYY-MM-DD.
  // These days are viewable but not re-bookable; their time cannot be changed here.
  const bookedByDate = useMemo(() => {
    const map: Record<string, { time: string; end_time: string; attend_status?: string | null }> = {};
    const list = preauth?.appointments?.upcoming_appt;
    if (Array.isArray(list)) {
      for (const a of list) {
        if (a?.attend_date) map[String(a.attend_date)] = a;
      }
    }
    return map;
  }, [preauth]);

  // Display labels for the compact context summary. Values are preselected from the
  // preauth on open; these resolve the human-readable text to show.
  const selectedLocationLabel =
    departments.find((d) => String(d.id) === selectedLocation)?.name ?? selectedLocation;
  const selectedSpecialityLabel = selectedGroup
    ? selectedGroup.name
      ? `${selectedGroup.short_name} (${selectedGroup.name})`
      : selectedGroup.short_name
    : selectedSpeciality;

  // The exclusive end cap for a range starting at `startMin` on a given day:
  // the first non-available slot after the start (lunch/booked/blocked/holiday),
  // otherwise 15 min past the last contiguous available slot.
  const blockTickAfter = (day: DateSlots, startMin: number): number => {
    let tick = startMin + 15;
    const sorted = [...day.slots]
      .map((s) => ({ min: timeToMinutes(s.time), available: s.type === "available" && !s.disabled }))
      .filter((s) => Number.isFinite(s.min))
      .sort((a, b) => a.min - b.min);
    for (const s of sorted) {
      if (s.min < startMin) continue;
      if (s.min === startMin) continue; // the start slot itself
      if (!s.available) break; // first blocker stops the span
      tick = s.min + 15;
    }
    return tick;
  };

  // Auto end = start + visit duration, truncated at the earliest blocker; ≥ start+15.
  const computeAutoEnd = (day: DateSlots, startLabel: string): string => {
    const startMin = timeToMinutes(startLabel);
    const cap = blockTickAfter(day, startMin);
    const end = Math.min(startMin + slotDuration, cap);
    return minutesToLabel(Math.max(end, startMin + 15));
  };

  // Click an available slot → create/replace this day's appointment, or, when
  // clicking the day's own Start/End cell, clear it.
  const handleSlotClick = (day: DateSlots, slot: TimeSlot) => {
    if (slot.disabled || slot.type !== "available") return;
    const date = day.date;
    const existing = selectedByDay[date];
    if (existing && (existing.startTime === slot.time || cellState(date, slot.time) === "end")) {
      setSelectedByDay((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
      return;
    }
    // NOTE: the 24h minimum lead time is enforced by the backend — it returns those
    // slots as `type: "not_available"` / `disabled: true` (with a `reason`), so they
    // render as "Not Available" and are never clickable. No client-side check needed.
    if (!existing && (sessionLimit <= 0 || selectedCount >= sessionLimit)) {
      toast.warning("Session limit reached. Cannot select more appointments.");
      return;
    }
    // Ensure there is enough *continuous* availability from this slot to fit the
    // required appointment length (backend-owned visit-type duration). blockTickAfter
    // gives the first blocker after the start, so the span = cap - start.
    const startMin = timeToMinutes(slot.time);
    const availableMin = blockTickAfter(day, startMin) - startMin;
    if (availableMin < slotDuration) {
      setTooShortInfo({ available: formatDuration(availableMin), required: formatDuration(slotDuration) });
      return;
    }
    setSelectedByDay((prev) => ({
      ...prev,
      [date]: {
        startTime: slot.time,
        endTime: computeAutoEnd(day, slot.time),
        transport: false,
        virtual: false,
      },
    }));
  };

  const handleDeleteDay = (date: string) => {
    setSelectedByDay((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  };

  // Convert a 12h slot label ("8:00 AM") to the 24h "HH:MM" the schedule API expects.
  const to24h = (label: string): string => {
    const m = timeToMinutes(label);
    if (!Number.isFinite(m)) return "";
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  // Book each selected slot via appointment-schedule (one POST per slot). Transport/
  // Virtual are intentionally not sent here — those toggles stay UI-only for now.
  const handleSchedule = async () => {
    if (submitting) return;
    if (selectedCount === 0) {
      toast.error("Select at least one time slot");
      return;
    }

    const patientId = getActivePatientId();
    const departmentName =
      departments.find((d) => String(d.id) === selectedLocation)?.name ?? selectedLocation;

    const days = Object.entries(selectedByDay).sort(([a], [b]) => a.localeCompare(b));

    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        days.map(([date, sel]) =>
          Apis.scheduleAppointment(user?.name ?? "", preauthCaseId, preauthMaId, patientId, {
            department: departmentName,
            service: selectedSpeciality,
            attend_type: selectedVisitType,
            pa_req: String(preauth?.pa_req ?? ""),
            attend_status: "S",
            physicanId: selectedPhysicianId ?? "",
            physicanName: selectedProvider,
            attend_date: date,
            svc_date_start: svcDateStart,
            svc_date_end: svcDateEnd,
            time: to24h(sel.startTime),
            end_time: to24h(sel.endTime),
            status: String(preauth?.status ?? ""),
            pa_resp: String(preauth?.pa_resp ?? ""),
            no_sessions: 1,
            provider_code: selectedProviderId,
            company_name: selectedCompany,
            is_patient_portal: 1,
          }),
        ),
      );

      // A slot fails if the call rejected OR the response explicitly says success:false.
      const failed: string[] = [];
      results.forEach((res, i) => {
        const date = days[i][0];
        if (res.status === "rejected") {
          failed.push(date);
        } else if ((res.value as any)?.success === false) {
          failed.push(date);
        }
      });

      // Refetch the Appointments page whenever at least one slot was booked.
      if (failed.length < days.length) {
        onScheduled?.();
      }

      if (failed.length === 0) {
        toast.success(
          days.length === 1 ? "Appointment scheduled." : `${days.length} appointments scheduled.`,
        );
        onClose();
      } else if (failed.length === days.length) {
        // Surface the server message from the first failure when available.
        const first = results[0];
        const msg =
          first.status === "rejected"
            ? getApiErrorMessage(first.reason)
            : (first.value as any)?.message;
        toast.error(msg || "Failed to schedule appointments.");
      } else {
        const failedLabels = failed.map((d) => formatDayHeader(d)).join(", ");
        toast.error(`Some appointments could not be scheduled: ${failedLabels}`);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  // Render state for a slot cell on a selected day: start | end | in-range |
  // disabled-day, or null when the day is not selected.
  const cellState = (date: string, time: string): "start" | "end" | "in-range" | "disabled-day" | null => {
    const sel = selectedByDay[date];
    if (!sel) return null;
    const slotMin = timeToMinutes(time);
    const startMin = timeToMinutes(sel.startTime);
    const endMin = timeToMinutes(sel.endTime);
    const lastOccupied = endMin - 15;
    if (slotMin === startMin) return "start";
    if (slotMin === lastOccupied && lastOccupied > startMin) return "end";
    if (slotMin > startMin && slotMin < lastOccupied) return "in-range";
    return "disabled-day";
  };

  // Days are paginated from a FLAT, ordered list of every contiguously-loaded block
  // (0,1,2,…). Slicing a flat list 5-at-a-time guarantees each page is exactly
  // PAGE_COLUMNS days regardless of how many working days any single block returned —
  // this is what stops the strip from ever showing 4 days mid-range.
  const loadedDates = useMemo(() => {
    const out: DateSlots[] = [];
    for (let i = 0; i in blockCache; i++) out.push(...blockCache[i]);
    return out;
  }, [blockCache]);

  // First not-yet-loaded contiguous block, and whether it still falls in the window.
  let nextUnloadedBlock = 0;
  while (nextUnloadedBlock in blockCache) nextUnloadedBlock++;
  const moreBlocksInRange =
    !!scheduleRangeStart && !!svcDateEnd &&
    addDays(scheduleRangeStart, BLOCK_WINDOW_DAYS * nextUnloadedBlock) <= svcDateEnd;

  const pageStartIdx = (page - 1) * PAGE_COLUMNS;

  // Lazily load blocks in order until the current page (plus one page of look-ahead) is
  // covered. Each load grows `loadedDates` and re-runs this effect, chaining until we
  // have enough days or the authorized window is exhausted. The current page loads in
  // the foreground (shows a spinner); the look-ahead block loads in the background.
  useEffect(() => {
    if (!moreBlocksInRange) return;
    const needed = page * PAGE_COLUMNS + PAGE_COLUMNS; // current page + look-ahead
    if (loadedDates.length >= needed) return;
    const background = loadedDates.length >= pageStartIdx + PAGE_COLUMNS; // current page already covered
    loadBlock(nextUnloadedBlock, background);
  }, [page, pageStartIdx, loadedDates.length, nextUnloadedBlock, moreBlocksInRange, loadBlock]);

  const pagedDates = loadedDates.slice(pageStartIdx, pageStartIdx + PAGE_COLUMNS);
  // Still loading this page while it isn't yet a full window AND more blocks can arrive.
  const isPageLoading =
    loadedDates.length < pageStartIdx + PAGE_COLUMNS && moreBlocksInRange && !timeSlotsError;
  const hasPrevPage = page > 1;
  const hasNextPage = loadedDates.length > pageStartIdx + PAGE_COLUMNS || moreBlocksInRange;

  // Only bookable slots for a day: an available slot is shown ONLY when there is enough
  // *continuous* availability from it to fit the full appointment duration (visit-type
  // `slotDuration`). Slots that can't hold the whole appointment are hidden entirely, so
  // the "time slot not long enough" path is never reached. (unavailable/lunch/holiday/
  // booked/past are already excluded.)
  const availableSlots = (d: DateSlots): TimeSlot[] =>
    d.is_holiday
      ? []
      : d.slots.filter((s) => {
          if (s.type !== "available" || s.disabled) return false;
          const startMin = timeToMinutes(s.time);
          return blockTickAfter(d, startMin) - startMin >= slotDuration;
        });
  const dayHasOpenings = (d: DateSlots): boolean => availableSlots(d).length > 0;

  // Human-readable reason a day can't be booked, for the disabled-pill tooltip.
  // Returns null when the day is selectable. Values map to the backend's day-level
  // fields (is_holiday/holiday_name, is_available/unavailable_reason); the fall-through
  // covers open days whose slots are all taken/blocked/too short to fit the visit.
  const dayUnavailableReason = (d: DateSlots): string | null => {
    if (dayHasOpenings(d)) return null;
    if (d.is_holiday) return d.holiday_name ? `Holiday — ${d.holiday_name}` : "Holiday — clinic closed";
    if (d.is_available === false) {
      switch (d.unavailable_reason) {
        case "provider_absence":
          return "Provider is not available on this day";
        case "not_scheduled":
          return "Provider is not scheduled on this day";
        case "no_availability":
          return "No provider availability for this day";
        default:
          return "Provider is not available on this day";
      }
    }
    return "No open time slots for this day";
  };

  // Day currently focused in the pill strip, and its bookable times.
  const activeDay = pagedDates.find((d) => d.date === activeDate) ?? null;
  const activeDaySlots = activeDay ? availableSlots(activeDay) : [];

  // Keep the focused day valid: whenever the visible page of dates changes (paging or
  // a query reset), focus the first day with openings, falling back to the first day.
  useEffect(() => {
    if (pagedDates.length === 0) return;
    if (pagedDates.some((d) => d.date === activeDate)) return; // keep a still-visible selection
    const firstOpen = pagedDates.find((d) => availableSlots(d).length > 0);
    setActiveDate((firstOpen ?? pagedDates[0]).date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedDates, activeDate]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[1040px] w-[94%] max-h-[90vh] p-0 gap-0 pointer-events-auto min-h-auto flex flex-col overflow-hidden"
      >
        {/* ── Fixed header ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border min-h-auto flex-shrink-0 space-y-0">
          <div className="flex items-start justify-between w-full gap-3">
            <div className="flex items-start gap-2.5">
              <CalendarDays className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <DialogTitle className="text-lg font-semibold leading-tight text-left">
                  Schedule Your Remaining Appointments
                </DialogTitle>
                {!isModalLoading && !sessionsBlockMessage && (
                  <p className="text-sm text-muted-foreground text-left">
                    {sessionLimit > 0
                      ? `Choose up to ${sessionLimit} appointment${sessionLimit === 1 ? "" : "s"}. Only available times are shown.`
                      : "Only available times are shown."}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* ── Modal-level loader ── */}
        {isModalLoading && (
          <div className="flex items-center justify-center min-h-[320px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* ── Sessions completed block message ── */}
        {!isModalLoading && sessionsBlockMessage && (
          <div className="flex flex-col items-center justify-center gap-3 min-h-[320px] py-8 px-6">
            <AlertCircle className="h-10 w-10 text-amber-500 flex-shrink-0" />
            <p className="text-center text-sm text-foreground max-w-md">{sessionsBlockMessage}</p>
          </div>
        )}

        {/* ── Scrollable body ── */}
        {!isModalLoading && !sessionsBlockMessage && (
        <div className="flex-1 overflow-auto px-6 py-4 space-y-5">

          {/* Provider context bar: Location · Speciality · Provider · In Between range */}
          {(() => {
            // Authorized service window (start → ext_date/end), shown as "In Between" so
            // the range lives in the same bar as the other details (no duplicate below).
            const rangeEndRaw = preauth?.ext_date || svcDateEnd;
            const fmtR = (ymd?: string | null) => {
              if (!ymd) return "";
              const d = new Date(String(ymd) + "T00:00:00");
              return isNaN(d.getTime()) ? "" : `${SHORT_MONTH[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
            };
            const inBetween =
              svcDateStart && rangeEndRaw ? `In Between: ${fmtR(svcDateStart)} – ${fmtR(rangeEndRaw)}` : "";
            const parts = [
              { icon: MapPin, value: selectedLocationLabel },
              { icon: Stethoscope, value: selectedSpecialityLabel },
              { icon: User, value: selectedProvider },
              { icon: CalendarDays, value: inBetween },
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

          {/* Session-limit reached banner */}
          {sessionLimit === 0 && (
            <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              No remaining authorized sessions to schedule.
            </div>
          )}

          {/* ── Day picker + times | Your appointments ── */}
          <div className="flex flex-col lg:flex-row gap-5">

            {/* Left: choose a day + available times */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* Choose a day */}
              <div className="space-y-3.5">
                <h3 className="text-base font-semibold text-foreground whitespace-nowrap">Choose a day</h3>

                <div className="flex items-center gap-2">
                  {(hasPrevPage || hasNextPage) && (
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={!hasPrevPage || isPageLoading}
                      aria-label="Previous days"
                      className="flex-shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}

                  <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {isPageLoading ? (
                      <div className="flex items-center justify-center w-full py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : timeSlotsError ? (
                      <div className="flex items-center justify-center w-full gap-2 py-4 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" /> {timeSlotsError}
                      </div>
                    ) : pagedDates.length === 0 ? (
                      <div className="flex items-center justify-center w-full py-4 text-sm text-muted-foreground">
                        No days available
                      </div>
                    ) : (
                      pagedDates.map((d) => {
                        const isActive = d.date === activeDate;
                        const isBooked = !!bookedByDate[d.date];
                        const hasSel = !!selectedByDay[d.date];
                        // Booked days stay viewable (selectable) even if they have no other
                        // openings; the time simply can't be changed here.
                        const open = isBooked || dayHasOpenings(d);
                        const reason = isBooked
                          ? "Appointment already booked"
                          : open
                          ? null
                          : dayUnavailableReason(d);
                        const pill = (
                          <button
                            // aria-disabled (not `disabled`) so hover/tap still fires the
                            // tooltip explaining why the day can't be booked.
                            aria-disabled={!open}
                            onClick={() => { if (open) setActiveDate(d.date); }}
                            className={cn(
                              "flex-1 min-w-[96px] flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-center transition-colors",
                              // Booked (indigo) > selected this session (green) > currently-viewed (primary).
                              isBooked
                                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                : hasSel
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : isActive
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
                              !open && "opacity-40 cursor-not-allowed hover:border-border hover:bg-card",
                            )}
                          >
                            {isBooked ? (
                              <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-indigo-600" />
                            ) : (
                              <Check
                                className={cn(
                                  "h-3.5 w-3.5 flex-shrink-0",
                                  hasSel ? "text-emerald-600" : "text-muted-foreground/40",
                                )}
                              />
                            )}
                            <span className="text-sm font-semibold leading-tight whitespace-nowrap">{formatDayPill(d.date)}</span>
                          </button>
                        );
                        return (
                          <div key={d.date} className="flex-1 min-w-[96px] flex">
                            {reason ? (
                              <Tooltip>
                                <TooltipTrigger asChild>{pill}</TooltipTrigger>
                                <TooltipContent>{reason}</TooltipContent>
                              </Tooltip>
                            ) : (
                              pill
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {(hasPrevPage || hasNextPage) && (
                    <button
                      onClick={() => goToPage(page + 1)}
                      disabled={!hasNextPage || isPageLoading}
                      aria-label="Next days"
                      className="flex-shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Available times for the focused day */}
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">
                  {activeDay
                    ? bookedByDate[activeDay.date]
                      ? `Your appointment on ${formatDayHeader(activeDay.date)}`
                      : `Available times for ${formatDayHeader(activeDay.date)}`
                    : "Available times"}
                </h3>

                {isPageLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : timeSlotsError ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" /> {timeSlotsError}
                  </div>
                ) : !activeDay ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    Select a day to see available times.
                  </div>
                ) : bookedByDate[activeDay.date] ? (
                  // Patient already has an appointment this day — read-only, not editable.
                  <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 py-8 px-4 text-center">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-700">
                      <CalendarClock className="h-4 w-4 flex-shrink-0" /> Appointment already booked
                    </div>
                    <div className="text-sm text-foreground">
                      {time24ToLabel(bookedByDate[activeDay.date].time)} → {time24ToLabel(bookedByDate[activeDay.date].end_time)}
                    </div>
                    <div className="text-xs text-muted-foreground">This time can’t be changed here.</div>
                  </div>
                ) : activeDay.is_holiday ? (
                  <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
                    <p className="text-sm font-medium text-foreground">Clinic closed</p>
                    <p className="text-xs text-muted-foreground">{activeDay.holiday_name || "Holiday"}</p>
                  </div>
                ) : activeDaySlots.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    No available times for this day.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {activeDaySlots.map((slot) => {
                      const isSel = selectedByDay[activeDay.date]?.startTime === slot.time;
                      return (
                        <button
                          key={slot.time}
                          onClick={() => handleSlotClick(activeDay, slot)}
                          className={cn(
                            "rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                            isSel
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-foreground hover:border-primary hover:bg-primary/5 hover:text-primary",
                          )}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Your appointments */}
            <div className="w-full lg:w-72 flex-shrink-0 rounded-lg border border-emerald-200 bg-emerald-50/40 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-200 bg-emerald-50">
                <CalendarCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-emerald-700 leading-tight">Your appointments</div>
                  <div className="text-xs text-emerald-600/80">{selectedCount} of {sessionLimit || "?"} selected</div>
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-[340px] overflow-y-auto flex-1">
                {selectedCount === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8 px-2">Select a time to add it here.</p>
                ) : (
                  Object.keys(selectedByDay).sort().map((date) => {
                    const sel = selectedByDay[date];
                    return (
                      <div key={date} className="rounded-md border border-emerald-100 bg-card p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-sm font-semibold text-foreground truncate">{formatDayHeader(date)}</div>
                            <div className="text-xs text-muted-foreground">{sel.startTime} → {sel.endTime}</div>
                          </div>
                          <button
                            onClick={() => handleDeleteDay(date)}
                            aria-label={`Remove ${formatDayHeader(date)}`}
                            title="Remove"
                            className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* ── Fixed footer ── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Close
          </Button>
          {!sessionsBlockMessage && (
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={handleSchedule}
              disabled={submitting || selectedCount === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scheduling…
                </>
              ) : (
                "Schedule"
              )}
            </Button>
          )}
        </div>
      </DialogContent>

      <SlotTooShortModal
        open={tooShortInfo !== null}
        onClose={() => setTooShortInfo(null)}
        availableLabel={tooShortInfo?.available ?? ""}
        requiredLabel={tooShortInfo?.required ?? ""}
      />
    </Dialog>
  );
}

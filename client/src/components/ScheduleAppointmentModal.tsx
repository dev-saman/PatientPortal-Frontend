import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Trash2, CalendarDays, CalendarCheck, Coffee, Loader2, AlertCircle, UserX, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { getActivePatientId } from "@/lib/caseContext";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDate } from "@/lib/utils";
import type { PreauthRecord } from "@/components/SelectPreauthorizationModal";
import BookingTooSoonModal from "@/components/BookingTooSoonModal";
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

// Minimum lead time (hours) before an appointment slot may be booked. This is a
// backend business rule (appointment-schedule rejects slots < 24h away with
// "The attend date and time must be at least 24 hours from now."); mirrored here
// only to give the patient immediate feedback. The backend remains authoritative.
const MIN_LEAD_HOURS = 24;

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

  // Shown when the patient tries to select a slot less than MIN_LEAD_HOURS away.
  const [showTooSoonModal, setShowTooSoonModal] = useState(false);

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

  // Time slots fetched from get-time-slots-date-range
  const [timeSlotDates, setTimeSlotDates] = useState<DateSlots[]>([]);
  const [timeSlotsLoading, setTimeSlotsLoading] = useState(false);
  const [timeSlotsError, setTimeSlotsError] = useState<string | null>(null);

  // Find the group whose short_name matches the selected speciality
  const selectedGroup = specialityGroups.find((g) => g.short_name === selectedSpeciality) ?? null;

  // Visit type options: from the selected group's visit_types (deduplicated by visittype_code)
  const visitTypeOptions = (() => {
    if (!selectedGroup) return [];
    const seen = new Set<string>();
    return (selectedGroup.visit_types ?? []).filter((vt) => {
      const key = vt.visittype_code;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

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
    setTimeSlotDates([]);
    setTimeSlotsError(null);
    setSelectedByDay({});
    setSessionLimit(0);
    setShowTooSoonModal(false);
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

  useEffect(() => {
    if (!selectedLocation || !selectedPhysicianId || !svcDateStart || !svcDateEnd || !preauthCaseId) return;
    setTimeSlotsLoading(true);
    setTimeSlotsError(null);
    setTimeSlotDates([]);
    // Reloading the grid (e.g. after a visit-type change) invalidates any picks.
    setSelectedByDay({});
    setPage(1);
    Apis.getTimeSlotDateRange(
      selectedPhysicianId,
      selectedLocation,
      svcDateStart,
      svcDateEnd,
      preauthCaseId,
      selectedVisitType,
      selectedSpeciality,
    )
      .then((data: any) => {
        if (!data.status) {
          setTimeSlotsError(data.message || "Failed to load time slots");
          return;
        }
        // Visit-type appointment length; fall back to the default when absent.
        const dur = Number(data.duration_minutes);
        setSlotDuration(Number.isFinite(dur) && dur > 0 ? dur : DEFAULT_DURATION_MIN);
        const dates: DateSlots[] = Array.isArray(data.dates) ? data.dates : [];
        setTimeSlotDates(dates);
        // Open on the page containing today when it falls inside the range (5/page).
        const todayIdx = dates.findIndex((d) => d.date === toYMD(new Date()));
        if (todayIdx >= 0) setPage(Math.floor(todayIdx / 5) + 1);
      })
      .catch(() => {
        setTimeSlotsError("Failed to load time slots");
      })
      .finally(() => {
        setTimeSlotsLoading(false);
      });
  }, [selectedLocation, selectedPhysicianId, svcDateStart, svcDateEnd, preauthCaseId, selectedVisitType, selectedSpeciality]);

  const todayYMD = toYMD(new Date());
  const selectedCount = Object.keys(selectedByDay).length;

  // Display labels for the read-only context fields. Values are preselected from
  // the preauth on open; these just resolve the human-readable text to show.
  const selectedLocationLabel =
    departments.find((d) => String(d.id) === selectedLocation)?.name ?? selectedLocation;
  const selectedSpecialityLabel = selectedGroup
    ? selectedGroup.name
      ? `${selectedGroup.short_name} (${selectedGroup.name})`
      : selectedGroup.short_name
    : selectedSpeciality;
  const selectedVisitTypeObj = visitTypeOptions.find((vt) => vt.visittype_code === selectedVisitType);
  const selectedVisitTypeLabel = selectedVisitTypeObj
    ? `${selectedVisitTypeObj.visittype_code.toUpperCase()} (${selectedVisitTypeObj.visittype_name})`
    : selectedVisitType;

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
    // Enforce the minimum lead time before allowing a new selection. The backend
    // owns this rule; this is immediate UX feedback so the patient can't pick a
    // slot the schedule API would reject.
    const slotAt = new Date(`${date}T00:00:00`);
    slotAt.setMinutes(slotAt.getMinutes() + timeToMinutes(slot.time));
    if (slotAt.getTime() - Date.now() < MIN_LEAD_HOURS * 60 * 60 * 1000) {
      setShowTooSoonModal(true);
      return;
    }
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

  // Paginate dates: 5 per page
  const DATES_PER_PAGE = 5;
  const pagedDates = timeSlotDates.slice((page - 1) * DATES_PER_PAGE, page * DATES_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(timeSlotDates.length / DATES_PER_PAGE));

  // All unique times across the current page's dates, sorted chronologically so
  // rows line up across day columns.
  const pageTimeSlots: string[] = (() => {
    const seen = new Set<string>();
    pagedDates.forEach((d) => d.slots.forEach((s) => seen.add(s.time)));
    return Array.from(seen).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  })();

  // Shared input/field class (text inputs, date inputs, textarea)
  const fieldCls =
    "w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[1150px] w-[90%] h-[90vh] p-5 gap-0 pointer-events-auto min-h-auto flex flex-col"
      >
        {/* ── Fixed header ── */}
        <DialogHeader className="pb-4 border-b border-border min-h-auto flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
              <span>Schedule Remaining Appointments</span>
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* ── Modal-level loader ── */}
        {isModalLoading && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* ── Sessions completed block message ── */}
        {!isModalLoading && sessionsBlockMessage && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 px-4">
            <AlertCircle className="h-10 w-10 text-amber-500 flex-shrink-0" />
            <p className="text-center text-sm text-gray-700 max-w-md">{sessionsBlockMessage}</p>
          </div>
        )}

        {/* ── Scrollable body ── */}
        {!isModalLoading && !sessionsBlockMessage && (
        <div className="py-4 overflow-auto space-y-5 px-1 flex-1">

          {/* Row 1: Location · Speciality/Service Type · Service Provider */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input type="text" value={selectedLocationLabel || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Speciality/Service Type</label>
              <input type="text" value={selectedSpecialityLabel || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Provider</label>
              <input type="text" value={selectedProvider || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
          </div>

          {/* Row 2: Visit Type · Visit Status · Company · Provider ID */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visit Type</label>
              <input type="text" value={selectedVisitTypeLabel || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visit Status</label>
              <input type="text" defaultValue="Scheduled" disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input type="text" value={selectedCompany || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider ID</label>
              <input
                type="text"
                value={selectedProviderId}
                disabled
                readOnly
                className={`${fieldCls} cursor-not-allowed`}
                style={{ backgroundColor: "#f5f6f8" }}
              />
            </div>
          </div>

          {/* Row 3: Start Date · End Date · Ext Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Read-only date displays. Rendered as text (not type="date") so the format is
                always MM-DD-YYYY rather than the browser locale's. The underlying
                svcDateStart/svcDateEnd state stays YYYY-MM-DD for the API. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="text" value={formatDate(svcDateStart) || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="text" value={formatDate(svcDateEnd) || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ext Date</label>
              <input type="text" value={formatDate(preauth?.ext_date) || "--"} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
          </div>

          {/* ── Time Slots + Selected Appointments ── */}
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Select Available Time Slots */}
            <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden">
              {/* panel header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200" style={{ background: "#f8f0f0" }}>
                <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#5b0f0f" }}>
                  <CalendarDays className="h-4 w-4" />
                  Select Available Time Slots
                </div>
                <span className="bg-gray-100 text-gray-800 font-bold px-3 py-0.5 rounded" style={{ fontSize: "0.8rem" }}>
                  {selectedCount} / {sessionLimit || "?"}
                </span>
              </div>

              {/* Minimum lead-time note (backend rule: appointments must be >= 24h away) */}
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600 bg-gray-50 border-b border-gray-200">
                <Clock className="h-4 w-4 flex-shrink-0 text-gray-500" />
                Appointments can only be booked at least 24 hours in advance.
              </div>

              {/* Session limit reached banner */}
              {sessionLimit === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-200">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  Session limit reached. No remaining authorized sessions to schedule.
                </div>
              )}

              {/* Prev / Next navigation */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 text-sm border rounded px-3 py-1 transition-colors disabled:opacity-40 hover:text-white"
                    style={{ borderColor: "#5b0f0f", color: page === 1 ? "#5b0f0f" : undefined }}
                    onMouseEnter={(e) => { if (page !== 1) e.currentTarget.style.background = "#5b0f0f"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 text-sm border rounded px-3 py-1 transition-colors disabled:opacity-40 hover:text-white"
                    style={{ borderColor: "#5b0f0f", color: page >= totalPages ? "#5b0f0f" : undefined }}
                    onMouseEnter={(e) => { if (page < totalPages) e.currentTarget.style.background = "#5b0f0f"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Time slots body */}
              {timeSlotsLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              {!timeSlotsLoading && timeSlotsError && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-red-600 px-4">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {timeSlotsError}
                </div>
              )}
              {!timeSlotsLoading && !timeSlotsError && timeSlotDates.length === 0 && (
                <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                  No time slots available
                </div>
              )}
              {!timeSlotsLoading && !timeSlotsError && pagedDates.length > 0 && pageTimeSlots.length === 0 && (
                <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                  Provider not available for the selected days
                </div>
              )}
              {!timeSlotsLoading && !timeSlotsError && pagedDates.length > 0 && pageTimeSlots.length > 0 && (
              <div className="overflow-x-auto p-2">
                <table className="w-full table-fixed text-sm border-separate" style={{ borderSpacing: "3px" }}>
                  <thead>
                    <tr>
                      {pagedDates.map((d) => {
                        const isToday = d.date === todayYMD;
                        return (
                          <th
                            key={d.date}
                            style={{ width: `${100 / pagedDates.length}%` }}
                            className="px-1 py-1 text-center align-bottom"
                          >
                            <div className={`py-1 ${isToday ? "rounded-md" : ""}`} style={isToday ? { background: "#fff8e1" } : undefined}>
                              <div className="font-semibold" style={{ color: "#343a40", fontSize: "0.78rem" }}>{formatDayHeader(d.date)}</div>
                              {isToday && <div className="font-medium" style={{ color: "#b8860b", fontSize: "0.6rem" }}>Today</div>}
                              {selectedByDay[d.date] && <div className="font-medium" style={{ color: "#198754", fontSize: "0.65rem" }}>✓ Selected</div>}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageTimeSlots.map((time) => (
                      <tr key={time}>
                        {pagedDates.map((d) => {
                          const isToday = d.date === todayYMD;
                          const tdStyle: React.CSSProperties = { width: `${100 / pagedDates.length}%`, ...(isToday ? { background: "#fffde7" } : {}) };
                          const base = "block w-full rounded-[4px] border px-1 py-1 font-medium text-center leading-tight transition-colors";

                          // A holiday closes the WHOLE day regardless of the provider's
                          // schedule at any location — show "Holiday" in every row (no
                          // time slots), so e.g. morning slots from another location's
                          // schedule don't leak through as greyed times.
                          if (d.is_holiday) {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div
                                  className={`${base} cursor-not-allowed`}
                                  title={d.holiday_name || undefined}
                                  style={{ background: "#fef2f2", color: "#dc3545", borderColor: "#f5c6cb", fontSize: "0.68rem", fontWeight: 600 }}
                                >
                                  Holiday
                                </div>
                              </td>
                            );
                          }

                          // Provider not available for this whole day → N/A cell for every row
                          if (d.slots.length === 0) {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-not-allowed flex items-center justify-center gap-1`} style={{ background: "#f8f9fa", color: "#adb5bd", borderColor: "#e9ecef", fontSize: "0.7rem", opacity: 0.85 }}>
                                  <UserX className="h-3 w-3" /> N/A
                                </div>
                              </td>
                            );
                          }

                          const slot = d.slots.find((s) => s.time === time);
                          // No slot for this row on this day — e.g. today's already-passed
                          // early times, which the API omits. Render a greyed, non-selectable
                          // cell (labeled "Past" for today) rather than an empty cell, which
                          // would otherwise expose today's yellow column background with no text.
                          if (!slot) {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-not-allowed`} style={{ background: "#f8f9fa", color: "#c0c0c0", borderColor: "#e9ecef", fontSize: "0.72rem" }}>
                                  {isToday ? `${time} – Past` : time}
                                </div>
                              </td>
                            );
                          }

                          const st = cellState(d.date, time);

                          // Selected-day states
                          if (st === "start" || st === "end") {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <button
                                  onClick={() => handleSlotClick(d, slot)}
                                  className={base}
                                  style={{ background: "#5b0f0f", color: "#fff", borderColor: "#5b0f0f", fontSize: "0.72rem" }}
                                >
                                  ✓ {time} ({st === "start" ? "Start" : "End"})
                                </button>
                              </td>
                            );
                          }
                          if (st === "in-range") {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-default`} style={{ background: "#f8e8e8", color: "#5b0f0f", borderColor: "#e0c0c0", fontSize: "0.72rem" }}>{time}</div>
                              </td>
                            );
                          }
                          if (st === "disabled-day") {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-not-allowed`} style={{ background: "#f8f9fa", color: "#c0c0c0", borderColor: "#e9ecef", fontSize: "0.72rem" }}>{time}</div>
                              </td>
                            );
                          }

                          // Not on a selected day → render by slot type
                          if (slot.type === "lunch" || slot.is_lunch) {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-not-allowed flex items-center justify-center gap-1`} style={{ background: "#fff8e1", color: "#b8860b", borderColor: "#f0e6c0", fontSize: "0.7rem", opacity: 0.85 }}>
                                  <Coffee className="h-3 w-3" /> Lunch
                                </div>
                              </td>
                            );
                          }
                          if (slot.type === "not_available" || slot.type === "unavailable") {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-not-allowed flex items-center justify-center gap-1`} style={{ background: "#f8f9fa", color: "#adb5bd", borderColor: "#e9ecef", fontSize: "0.7rem", opacity: 0.85 }}>
                                  <UserX className="h-3 w-3" /> N/A
                                </div>
                              </td>
                            );
                          }
                          if (slot.type === "holiday") {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-not-allowed`} style={{ background: "#fef2f2", color: "#dc3545", borderColor: "#f5c6cb", fontSize: "0.68rem", fontWeight: 600 }}>Holiday</div>
                              </td>
                            );
                          }
                          // Occupied slots (booked / cross-location booked / blocked) are all
                          // shown generically as "Not Available" — the patient must not learn
                          // whether a slot is booked, blocked, or booked at another location.
                          if (slot.type === "booked" || slot.type === "cross_location_booked" || slot.type === "blocked" || slot.type === "blocked_cross_location") {
                            return (
                              <td key={d.date} style={tdStyle}>
                                <div className={`${base} cursor-not-allowed truncate`} title={`${time} – Not Available`} style={{ background: "#f8f9fa", color: "#adb5bd", borderColor: "#e9ecef", fontSize: "0.72rem" }}>{time} – Not Available</div>
                              </td>
                            );
                          }

                          // Available
                          return (
                            <td key={d.date} style={tdStyle}>
                              <button
                                onClick={() => handleSlotClick(d, slot)}
                                className={base}
                                style={{ background: "#fff", color: "#495057", borderColor: "#dee2e6", fontSize: "0.72rem" }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#f8f0f0"; e.currentTarget.style.borderColor = "#5b0f0f"; e.currentTarget.style.color = "#5b0f0f"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#dee2e6"; e.currentTarget.style.color = "#495057"; }}
                              >
                                {time}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>

            {/* Selected Appointments */}
            <div className="w-full lg:w-64 border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200" style={{ background: "#f0f8f0" }}>
                <CalendarCheck className="h-4 w-4" style={{ color: "#198754" }} />
                <span className="text-sm font-semibold" style={{ color: "#198754" }}>Selected Appointments</span>
              </div>
              <div className="p-2 space-y-2.5 max-h-80 overflow-y-auto" style={{ fontSize: "0.78rem" }}>
                {selectedCount === 0 ? (
                  <p className="text-gray-400 text-center py-3" style={{ fontSize: "0.78rem" }}>No slots selected yet</p>
                ) : (
                  Object.keys(selectedByDay).sort().map((date) => {
                    const sel = selectedByDay[date];
                    return (
                      <div key={date} className="rounded-md bg-white p-2" style={{ border: "1px solid #e9ecef" }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1.5">
                            <div className="font-semibold" style={{ color: "#5b0f0f", fontSize: "0.75rem" }}>{formatDayHeader(date)}</div>
                            <div style={{ color: "#666", fontSize: "0.72rem" }}>{sel.startTime} &rarr; {sel.endTime}</div>
                          </div>
                          <button
                            onClick={() => handleDeleteDay(date)}
                            title="Remove"
                            className="text-red-500 hover:text-red-700 border border-red-300 rounded p-1 transition-colors flex-shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
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
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border flex-shrink-0">
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

      <BookingTooSoonModal open={showTooSoonModal} onClose={() => setShowTooSoonModal(false)} />
      <SlotTooShortModal
        open={tooShortInfo !== null}
        onClose={() => setTooShortInfo(null)}
        availableLabel={tooShortInfo?.available ?? ""}
        requiredLabel={tooShortInfo?.required ?? ""}
      />
    </Dialog>
  );
}

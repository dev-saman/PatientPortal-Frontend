import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, ChevronDown, Car, Monitor, Trash2, CalendarDays, Loader2, AlertCircle } from "lucide-react";
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
import { getApiErrorMessage } from "@/lib/apiError";

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
}

interface CompanyOption {
  amd_company_name: string;
  amd_code: string;
  [key: string]: any;
}

const END_TIME_OPTIONS = ["8:00 AM", "8:15 AM", "8:30 AM", "8:45 AM", "9:00 AM"];

interface TimeSlot {
  time: string;
  is_lunch: boolean;
  type: string;
  disabled: boolean;
  cross_location?: string;
  is_cross_telemed?: boolean;
}

interface DateSlots {
  date: string;
  day_name: string;
  slots: TimeSlot[];
}

interface SelectedAppointment {
  day: string;
  time: string;
  endTime: string;
}

// Reusable select wrapper that keeps a solid white background and a
// properly-aligned custom chevron, matching the form-field height of inputs.
function SelectField({
  children,
  className = "",
  value,
  onChange,
  defaultValue,
  disabled,
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        className={`w-full appearance-none border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 shrink-0" />
    </div>
  );
}

export default function ScheduleAppointmentModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const [selectedSlots, setSelectedSlots] = useState<SelectedAppointment[]>([]);
  const [page, setPage] = useState(1);
  const totalSessions = 10;
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

  // Populated from the first preauth record
  const [svcDateStart, setSvcDateStart] = useState("");
  const [svcDateEnd, setSvcDateEnd] = useState("");
  const [preauthCaseId, setPreauthCaseId] = useState("");

  // Time slots fetched from get-time-slots-date-range
  const [timeSlotDates, setTimeSlotDates] = useState<DateSlots[]>([]);
  const [timeSlotsLoading, setTimeSlotsLoading] = useState(false);
  const [timeSlotsError, setTimeSlotsError] = useState<string | null>(null);

  // Tracks which slot is currently being verified via available-time-slots API
  const [pendingSlot, setPendingSlot] = useState<{ date: string; time: string } | null>(null);

  // Groups that have at least one physician
  const groupsWithPhysicians = specialityGroups.filter((g) => g.physicians.length > 0);

  // Speciality options: unique speciality_short from all physicians across all groups
  const specialityOptions = Array.from(
    new Set(
      groupsWithPhysicians.flatMap((g) =>
        g.physicians.map((p) => p.speciality_short).filter(Boolean)
      )
    )
  );

  // Find the group whose short_name matches the selected speciality
  const selectedGroup = specialityGroups.find((g) => g.short_name === selectedSpeciality) ?? null;

  // Provider options: physicians from the selected speciality's group only
  const providerOptions = selectedGroup
    ? selectedGroup.physicians.map((p) => p.physician_name).filter(Boolean)
    : [];

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
          setSelectedCompany(list[0].amd_company_name);
          setSelectedProviderId(list[0].amd_code);
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
    const firstSpeciality = firstGroup.short_name;
    const firstPhysician = firstGroup.physicians[0];
    const firstProvider = firstPhysician?.physician_name ?? "";
    const firstVisitType = firstGroup.visit_types[0]?.visittype_code ?? "";
    setSelectedSpeciality(firstSpeciality);
    setSelectedProvider(firstProvider);
    setSelectedVisitType(firstVisitType);
    if (firstPhysician?.physician_id) {
      fetchCompanyData(department, firstPhysician.physician_id, isInit);
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
    setTimeSlotDates([]);
    setTimeSlotsError(null);
    setSelectedSlots([]);
    setPendingSlot(null);
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
            const firstId = String(list[0].id);
            setSelectedLocation(firstId);
            pendingInitRef.current -= 1;
            fetchSpecialityData(firstId, true);
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

    // Step 1: Get Approved Preauth (case_id injected once by the request interceptor)
    Apis.getApprovedPreauth()
      .then((preauthData: any) => {
        // The response may return a flat object or an array under data/records.
        // Always use the first record's case_id and ma_id per requirements.
        const records: any[] = Array.isArray(preauthData?.data)
          ? preauthData.data
          : Array.isArray(preauthData?.records)
          ? preauthData.records
          : Array.isArray(preauthData)
          ? preauthData
          : [preauthData];

        const firstRecord = records[0] ?? {};
        const preauthCaseId = String(firstRecord?.case_id ?? "");
        const preauthMaId = firstRecord?.ma_id ?? "";
        setPreauthCaseId(preauthCaseId);

        // Populate date fields from the same first record
        if (firstRecord?.svc_date_start) setSvcDateStart(String(firstRecord.svc_date_start));
        if (firstRecord?.svc_date_end) setSvcDateEnd(String(firstRecord.svc_date_end));

        // Step 2: Check Sessions Completed using first record's case_id and ma_id
        return Apis.checkSessionsCompleted(preauthCaseId, preauthMaId);
      })
      .then((checkData: any) => {
        if (checkData?.success === false) {
          // Show only the message; hide all form content
          setSessionsBlockMessage(checkData.message ?? "Sessions already completed.");
          setIsModalLoading(false);
          return;
        }
        // success: true — proceed with normal form loading
        loadFormData();
      })
      .catch(() => {
        // If either preauth API call fails, fall through to normal form loading
        loadFormData();
      });
  }, [open]);

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedLocation(val);
    fetchSpecialityData(val);
  };

  const handleSpecialityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSpeciality = e.target.value;
    setSelectedSpeciality(newSpeciality);
    const newGroup = specialityGroups.find((g) => g.short_name === newSpeciality) ?? null;
    const firstPhysician = newGroup?.physicians[0];
    setSelectedProvider(firstPhysician?.physician_name ?? "");
    setSelectedVisitType(newGroup?.visit_types[0]?.visittype_code ?? "");
    if (firstPhysician?.physician_id && selectedLocation) {
      fetchCompanyData(selectedLocation, firstPhysician.physician_id);
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerName = e.target.value;
    setSelectedProvider(providerName);
    setSelectedVisitType(selectedGroup?.visit_types[0]?.visittype_code ?? "");
    const physician = selectedGroup?.physicians.find((p) => p.physician_name === providerName);
    if (physician?.physician_id && selectedLocation) {
      fetchCompanyData(selectedLocation, physician.physician_id);
    }
  };

  // Derive physician_id for the currently selected provider
  const selectedPhysicianId = selectedGroup?.physicians.find(
    (p) => p.physician_name === selectedProvider
  )?.physician_id ?? null;

  useEffect(() => {
    if (!selectedLocation || !selectedPhysicianId || !svcDateStart || !svcDateEnd || !preauthCaseId) return;
    setTimeSlotsLoading(true);
    setTimeSlotsError(null);
    setTimeSlotDates([]);
    setSelectedSlots([]);
    setPendingSlot(null);
    setPage(1);
    Apis.getTimeSlotDateRange(selectedPhysicianId, selectedLocation, svcDateStart, svcDateEnd, preauthCaseId)
      .then((data: any) => {
        if (!data.status) {
          setTimeSlotsError(data.message || "Failed to load time slots");
          return;
        }
        setTimeSlotDates(Array.isArray(data.dates) ? data.dates : []);
      })
      .catch(() => {
        setTimeSlotsError("Failed to load time slots");
      })
      .finally(() => {
        setTimeSlotsLoading(false);
      });
  }, [selectedLocation, selectedPhysicianId, svcDateStart, svcDateEnd, preauthCaseId]);

  const handleSlotClick = (date: string, time: string) => {
    // Deselect immediately without API call
    const exists = selectedSlots.find((s) => s.day === date && s.time === time);
    if (exists) {
      setSelectedSlots((prev) => prev.filter((s) => !(s.day === date && s.time === time)));
      return;
    }
    if (selectedSlots.length >= totalSessions) return;
    if (!selectedPhysicianId || !selectedLocation || !preauthCaseId) return;
    // Block double-clicks while a check is in flight
    if (pendingSlot) return;

    setPendingSlot({ date, time });
    Apis.getAvailableTimeSlots(selectedPhysicianId, selectedLocation, date, time, preauthCaseId)
      .then((data: any) => {
        if (data?.status === false) {
          toast.error(data.message || "This time slot is not available");
          return;
        }
        setSelectedSlots((prev) => [...prev, { day: date, time, endTime: "8:45 AM" }]);
      })
      .catch(() => {
        toast.error("Failed to verify time slot availability");
      })
      .finally(() => {
        setPendingSlot(null);
      });
  };

  const formatSlotDay = (date: string) => {
    const found = timeSlotDates.find((d) => d.date === date);
    return found ? `${found.day_name}, ${date}` : date;
  };

  const handleEndTimeChange = (index: number, endTime: string) => {
    setSelectedSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, endTime } : s))
    );
  };

  const handleRemoveSlot = (index: number) => {
    setSelectedSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const isSelected = (date: string, time: string) =>
    selectedSlots.some((s) => s.day === date && s.time === time);

  // Paginate dates: 5 per page
  const DATES_PER_PAGE = 5;
  const pagedDates = timeSlotDates.slice((page - 1) * DATES_PER_PAGE, page * DATES_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(timeSlotDates.length / DATES_PER_PAGE));

  // All unique times across the current page's dates (in original order)
  const pageTimeSlots: string[] = (() => {
    const seen = new Set<string>();
    const result: string[] = [];
    pagedDates.forEach((d) => d.slots.forEach((s) => { if (!seen.has(s.time)) { seen.add(s.time); result.push(s.time); } }));
    return result;
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
              <span>
                Schedule Remaining Appointments {user?.name ? (
                  <span>for {user.name}</span>
                ) : null}
              </span>
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
              <SelectField
                value={selectedLocation}
                onChange={handleLocationChange}
                disabled={departmentsLoading}
                className={departmentsLoading ? "opacity-60 cursor-not-allowed" : ""}
              >
                {departmentsLoading ? (
                  <option value="">Loading...</option>
                ) : departments.length === 0 ? (
                  <option value="">No locations available</option>
                ) : (
                  departments.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))
                )}
              </SelectField>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Speciality/Service Type</label>
              <SelectField
                value={selectedSpeciality}
                onChange={handleSpecialityChange}
                disabled={specialityLoading || specialityGroups.length === 0}
                className={specialityLoading ? "opacity-60 cursor-not-allowed" : ""}
              >
                {specialityLoading ? (
                  <option value="">Loading...</option>
                ) : specialityOptions.length === 0 ? (
                  <option value="">No options available</option>
                ) : (
                  specialityOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))
                )}
              </SelectField>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Provider</label>
              <SelectField
                value={selectedProvider}
                onChange={handleProviderChange}
                disabled={specialityLoading || providerOptions.length === 0}
                className={specialityLoading ? "opacity-60 cursor-not-allowed" : ""}
              >
                {specialityLoading ? (
                  <option value="">Loading...</option>
                ) : providerOptions.length === 0 ? (
                  <option value="">No options available</option>
                ) : (
                  providerOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))
                )}
              </SelectField>
            </div>
          </div>

          {/* Row 2: Visit Type · Visit Status · Company · Provider ID */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visit Type</label>
              <SelectField
                value={selectedVisitType}
                onChange={(e) => setSelectedVisitType(e.target.value)}
                disabled={specialityLoading || visitTypeOptions.length === 0}
                className={specialityLoading ? "opacity-60 cursor-not-allowed" : ""}
              >
                {specialityLoading ? (
                  <option value="">Loading...</option>
                ) : visitTypeOptions.length === 0 ? (
                  <option value="">No options available</option>
                ) : (
                  visitTypeOptions.map((vt) => (
                    <option key={vt.visittype_code} value={vt.visittype_code}>
                      {vt.visittype_code.toUpperCase()} ({vt.visittype_name})
                    </option>
                  ))
                )}
              </SelectField>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visit Status</label>
              <input type="text" defaultValue="Scheduled" disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <SelectField
                value={selectedCompany}
                onChange={(e) => {
                  const opt = companyOptions.find((c) => c.amd_company_name === e.target.value);
                  setSelectedCompany(e.target.value);
                  setSelectedProviderId(opt?.amd_code ?? "");
                }}
                disabled={companyOptions.length === 0}
              >
                {companyOptions.length === 0 ? (
                  <option value="">No company available</option>
                ) : (
                  companyOptions.map((c, i) => (
                    <option key={i} value={c.amd_company_name}>{c.amd_company_name}</option>
                  ))
                )}
              </SelectField>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={svcDateStart} onChange={() => {}} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={svcDateEnd} onChange={() => {}} disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ext Date</label>
              <input type="text" value="--" disabled readOnly className={`${fieldCls} cursor-not-allowed`} style={{ backgroundColor: "#f5f6f8" }} />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <CalendarDays className="inline h-4 w-4 mr-1 text-gray-500" />
              Reason
            </label>
            <textarea
              rows={3}
              placeholder="Enter reason for appointment..."
              className={`${fieldCls} resize-none`}
            />
          </div>

          {/* ── Time Slots + Selected Appointments ── */}
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Select Available Time Slots */}
            <div className="flex-1 border border-red-200 rounded-lg overflow-hidden">
              {/* panel header */}
              <div className="flex items-center justify-between bg-red-50 px-4 py-2 border-b border-red-200">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                  <CalendarDays className="h-4 w-4" />
                  Select Available Time Slots
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {selectedSlots.length} / {totalSessions}
                </span>
              </div>

              {/* Prev / Next navigation */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 text-sm text-gray-600 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 text-sm text-white bg-primary rounded px-3 py-1 hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>

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
              {!timeSlotsLoading && !timeSlotsError && pagedDates.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr>
                      {pagedDates.map((d) => (
                        <th
                          key={d.date}
                          style={{ width: `${100 / pagedDates.length}%` }}
                          className="px-2 py-2 text-center font-medium border-b border-gray-200 text-xs text-gray-600"
                        >
                          <div>{d.day_name}</div>
                          <div className="text-gray-400 font-normal">{d.date}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageTimeSlots.map((time) => (
                      <tr key={time} className="border-b border-gray-100 last:border-0">
                        {pagedDates.map((d) => {
                          const slot = d.slots.find((s) => s.time === time);
                          if (!slot) return <td key={d.date} className="px-2 py-1" style={{ width: `${100 / pagedDates.length}%` }} />;
                          const selected = isSelected(d.date, time);
                          if (slot.type === "lunch") {
                            return (
                              <td key={d.date} className="px-2 py-1 text-center" style={{ width: `${100 / pagedDates.length}%` }}>
                                <span className="text-xs text-amber-500 italic">{time}</span>
                              </td>
                            );
                          }
                          if (slot.disabled) {
                            return (
                              <td key={d.date} className="px-2 py-1 text-center" style={{ width: `${100 / pagedDates.length}%` }}>
                                <span className="text-xs text-gray-400 line-through block leading-tight">{time}</span>
                                {slot.cross_location && (
                                  <span className="text-xs text-gray-400 block leading-tight" style={{ fontSize: "0.6rem" }}>
                                    {slot.is_cross_telemed ? "Telemed" : slot.cross_location}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          const isPending = pendingSlot?.date === d.date && pendingSlot?.time === time;
                          return (
                            <td key={d.date} className="px-2 py-1 text-center" style={{ width: `${100 / pagedDates.length}%` }}>
                              <button
                                onClick={() => handleSlotClick(d.date, time)}
                                disabled={isPending || (!!pendingSlot && !selected) || (selectedSlots.length >= totalSessions && !selected)}
                                className={`text-xs px-2 py-1 rounded w-full transition-colors disabled:opacity-40 ${
                                  selected
                                    ? "bg-primary text-white"
                                    : "text-gray-700 hover:bg-primary/10 hover:text-primary"
                                }`}
                              >
                                {isPending ? <Loader2 className="h-3 w-3 animate-spin inline" /> : time}
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
            <div className="w-full lg:w-64 border border-green-200 rounded-lg overflow-hidden flex-shrink-0">
              <div className="flex items-center gap-2 bg-green-50 px-4 py-2 border-b border-green-200">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-700">Selected Appointments</span>
              </div>
              <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                {selectedSlots.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No slots selected</p>
                ) : (
                  selectedSlots.map((slot, i) => (
                    <div key={i} className="border border-gray-200 rounded-md p-2 text-xs space-y-2">
                      <div className="font-medium text-primary">{formatSlotDay(slot.day)}</div>
                      <div className="text-gray-600">
                        {slot.time} — {slot.endTime}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-xs">End:</span>
                        {/* end-time inline select reuses the same wrapper */}
                        <div className="relative flex-1">
                          <select
                            value={slot.endTime}
                            onChange={(e) => handleEndTimeChange(i, e.target.value)}
                            className="w-full appearance-none border border-gray-300 rounded px-2 py-0.5 pr-6 text-xs text-gray-900 bg-white focus:outline-none"
                          >
                            {END_TIME_OPTIONS.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500" />
                        </div>
                        <button
                          onClick={() => handleRemoveSlot(i)}
                          className="text-red-400 hover:text-red-600 p-0.5 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <button className="flex items-center gap-1 border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                          <Car className="h-3 w-3" /> Transport
                        </button>
                        <button className="flex items-center gap-1 border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                          <Monitor className="h-3 w-3" /> Virtual
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* ── Fixed footer ── */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!sessionsBlockMessage && (
            <Button className="bg-primary hover:bg-primary/90">
              SAVE
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

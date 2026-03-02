"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
// Tabs removed — single-page drag-and-drop UI
import { useNotification } from "@/components/notification-provider"
import { useCrewStore } from "@/lib/cleanStore"
import { getAllBranches as getBranchesFromFirestore } from "@/lib/firestore-branch-service"
import { getActiveEmployees as getEmployeesFromFirestore } from "@/lib/firestore-employee-service"
import { addSchedule as addScheduleToFirestore, getSchedulesForDate as getSchedulesForDateFromFirestore, getSchedulesForWeek as getSchedulesForWeekFromFirestore, deleteSchedulesForWeek } from "@/lib/firestore-schedule-service"
import { saveManualOverride, getOverridesForWeek } from "@/lib/firestore-manual-override-service"
import { updateEmployee } from "@/lib/firestore-employee-service"
import { Search, RotateCcw, Edit, Calendar, Users, AlertTriangle, Clock, GripVertical, MapPin, X, Loader2, Info, CheckCircle, Building2, ArrowRightLeft } from "lucide-react"

// Map shift type string to actual start/end times
function getShiftTimes(shift: string): { shiftStart: string; shiftEnd: string } {
  switch (shift?.toUpperCase()) {
    case "PM": return { shiftStart: "14:00", shiftEnd: "22:00" }
    case "AM":
    default: return { shiftStart: "07:00", shiftEnd: "14:00" }
  }
}

// Send schedule notifications to each employee about their branch assignment
async function sendScheduleNotifications(
  assignments: Array<{ employeeId: string; employeeName: string; branchName?: string; shift?: string }>,
  weekLabel: string
) {
  const grouped = new Map<string, { employeeName: string; branchName: string; shift: string }>()
  for (const a of assignments) {
    // Deduplicate: one notification per employee (use latest assignment)
    grouped.set(a.employeeId, {
      employeeName: a.employeeName,
      branchName: a.branchName || "Unassigned",
      shift: a.shift || "AM",
    })
  }

  const promises: Promise<any>[] = []
  for (const [employeeId, info] of grouped) {
    const shiftLabel = info.shift === "PM" ? "PM (2pm - 10pm)" : "AM (7am - 2pm)"
    promises.push(
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: employeeId,
          title: "New Schedule Assignment",
          message: `You have been assigned to ${info.branchName} for the week of ${weekLabel} — ${shiftLabel} shift.`,
          type: "schedule",
        }),
      }).catch((err) => console.warn("[Notification] Failed to send to", employeeId, err))
    )
  }
  await Promise.allSettled(promises)
}

// Scheduling now uses live store data. No local sampleEmployees are present so the app starts empty.

// Sync employee branchId in the users table so Dashboard/validate-location reflect the schedule
async function syncEmployeeBranches(
  assignments: Array<{ employeeId: string; branchId: string }>
) {
  const seen = new Set<string>()
  const updates: Promise<void>[] = []
  for (const a of assignments) {
    if (seen.has(a.employeeId)) continue
    seen.add(a.employeeId)
    updates.push(
      updateEmployee(a.employeeId, { branchId: a.branchId }).catch((err) =>
        console.warn(`[syncEmployeeBranches] Failed for ${a.employeeId}:`, err)
      )
    )
  }
  await Promise.allSettled(updates)
}

// Branches are loaded from the live crew store (managed in Branch Management). We derive a
// lightweight `branchesList` from the store inside the component so the UI and rotation
// algorithm always reflect the actual branches configured by the admin.

export default function SchedulingPage() {
    // ...existing code...

  // ...existing code...

  // ...existing code...

  // (Auto-schedule rollover useEffect moved to after all useState and helper declarations)
  const { showNotification } = useNotification()
  const { branches, assignCrewToBranch, getCrewsForBranch, getActiveCrews, getAssignedBranch } = useCrewStore()

  // Helper function to format dates in local timezone (not UTC)
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  // retain store crews for compatibility with existing assignment logic
  const storeCrews = getActiveCrews()

  // Firestore-sourced data for branches and users (used for saving schedules and for UI where applicable)
  const [fireBranches, setFireBranches] = useState<Array<any>>([])
  const [fireEmployees, setFireEmployees] = useState<Array<any>>([])

  // derive a lightweight list of branches for the rotation algorithm — memoized
  const branchesList = useMemo(() => (
    fireBranches.length > 0
      ? fireBranches.map((b: any) => ({ id: b.id, name: b.branchName || b.name, address: b.address }))
      : (branches || []).map((b: any) => ({ id: b.id, name: b.branchName, address: b.address }))
  ), [fireBranches, branches])

  // whether at least one crew has been assigned to a branch (used to require initial manual seeding)
  const crews = storeCrews
  const hasInitialAssignments = useMemo(() => crews.some((c) => (getAssignedBranch ? getAssignedBranch(c.id) : null)), [crews, getAssignedBranch])

  // True when at least one crew/employee source has data (MySQL API employees OR Zustand store)
  const hasAnyEmployees = useMemo(() => (fireEmployees && fireEmployees.length > 0) || crews.length > 0, [fireEmployees, crews])

  // Lookup map: branchId → branch object (O(1) instead of O(n) per lookup)
  const fireBranchMap = useMemo(() => {
    const map = new Map<string, any>()
    for (const b of fireBranches) map.set(String(b.id), b)
    return map
  }, [fireBranches])

  // Lookup map: branchName → branch object
  const fireBranchByName = useMemo(() => {
    const map = new Map<string, any>()
    for (const b of fireBranches) {
      if (b.branchName) map.set(b.branchName, b)
      if (b.name && b.name !== b.branchName) map.set(b.name, b)
    }
    return map
  }, [fireBranches])
  
  // ===== SINGLE SOURCE OF TRUTH for branch assignments =====
  // employeeId → { branchId, branchName, isManual, shift }
  // Loaded from Firestore on mount. Modified by manual assign / auto-rotation. Saved back.
  const [currentAssignments, setCurrentAssignments] = useState<Record<string, {
    branchId: string; branchName: string; isManual: boolean; shift: string;
  }>>({})

  // Derive display-friendly array from currentAssignments (drop-in for old appliedRotation)
  const currentScheduleView = useMemo(() => {
    return Object.entries(currentAssignments).map(([empId, a]) => {
      const emp = fireEmployees.find(e => String(e.id) === empId)
      return {
        id: empId,
        firstName: emp?.firstName || "Unknown",
        surname: emp?.surname || "",
        email: emp?.email,
        nextWeekBranch: a.branchName,
        nextWeekShift: a.shift,
        isManual: a.isManual,
      }
    })
  }, [currentAssignments, fireEmployees])

  // Helper: get employees assigned to a specific branch
  const getFirestoreEmployeesForBranch = useCallback((branchId: string | number) => {
    const branch = fireBranchMap.get(String(branchId))
    const branchName = branch?.branchName
    if (!branchName) return []

    const hasAssignments = Object.keys(currentAssignments).length > 0

    return fireEmployees.filter(emp => {
      const a = currentAssignments[String(emp.id)]
      if (a) return a.branchName === branchName
      // Before any schedule is loaded, fall back to DB branchId
      if (!hasAssignments && emp.branchId) return String(emp.branchId) === String(branchId)
      return false
    })
  }, [fireBranchMap, fireEmployees, currentAssignments])
  
  const [selectedDate, setSelectedDate] = useState(() => {
    // Initialize to Monday of current week
    const today = new Date()
    const currentDay = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - currentDay + (currentDay === 0 ? -6 : 1))
    return formatDateLocal(monday)
  })
  const [appliedScheduleWeek, setAppliedScheduleWeek] = useState<{ weekStart?: string; weekEnd?: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedBranchForDisplay, setSelectedBranchForDisplay] = useState<string | null>(null)
  const [nextWeekRotationPreview, setNextWeekRotationPreview] = useState<any[]>([])

  const [showRotationPreview, setShowRotationPreview] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [lastAssignmentSnapshot, setLastAssignmentSnapshot] = useState<Array<{ crewId: number; prevBranchId: number | null }>>([])
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<number | string | null>(null)
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string>>({})
  const [weeklyOverrides, setWeeklyOverrides] = useState<any[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<number>>(() => {
    const d = new Date().getDay()
    const idx = d === 0 ? 6 : d - 1 // Mon=0 .. Sun=6
    return new Set([idx])
  })
  const [weekSchedules, setWeekSchedules] = useState<Record<string, any>>({})
  const [weekAttendance, setWeekAttendance] = useState<Record<string, Record<string, string>>>({})

  // Drag-and-drop states (ref is the reliable source — state is only for visual feedback)
  const draggedEmployeeRef = useRef<{ id: string; name: string; fromBranch: string | null } | null>(null)
  const [draggedEmployee, setDraggedEmployee] = useState<{ id: string; name: string; fromBranch: string | null } | null>(null)
  const [dragOverBranch, setDragOverBranch] = useState<string | null>(null)
  const [showDurationDialog, setShowDurationDialog] = useState(false)
  const [pendingDrop, setPendingDrop] = useState<{ employeeId: string; employeeName: string; branchId: string; branchName: string } | null>(null)
  const [isSavingDrop, setIsSavingDrop] = useState(false)

  // Dismissible help banner
  const [showHelp, setShowHelp] = useState(() => {
    if (typeof window !== "undefined") return !localStorage.getItem("scheduling-help-dismissed")
    return true
  })

  // Rate limiter for Generate Rotation — 10 second cooldown
  const [generateCooldown, setGenerateCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startGenerateCooldown = useCallback(() => {
    setGenerateCooldown(10)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setGenerateCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          cooldownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])
  useEffect(() => { return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) } }, [])

  const generateRotation = (opts?: { avoidSameBranch?: boolean }) => {
    // Prefer Firestore employees for preview/rotation when available; fall back to store crews
    const sourceEmployees = (fireEmployees && fireEmployees.length > 0) ? fireEmployees : crews

    // Build a lightweight employee view; try to preserve a link to the in-store crew id when possible
    const lightweight = sourceEmployees.map((c: any, idx: number) => {
      const matchedStoreCrew = crews.find((sc) => {
        if (c.email && sc.email) return (c.email || "").toLowerCase() === (sc.email || "").toLowerCase()
        return (sc.firstName === c.firstName && sc.surname === c.surname)
      })
      const storeCrewId = matchedStoreCrew ? matchedStoreCrew.id : null
      const empId = c.id ?? `fire-${idx}`
      const ca = currentAssignments[String(empId)]

      return {
        id: empId,
        storeCrewId,
        firstName: c.firstName,
        surname: c.surname,
        email: c.email,
        currentBranch: ca ? ca.branchName : "Unassigned",
        shift: ca?.shift || "AM",
      }
    })

    if (!lightweight.length || branchesList.length === 0) return []

  const avoidSame = opts?.avoidSameBranch ?? true

  // Prepare balanced desired totals per branch (base + distribute remainder)
    const total = lightweight.length
    const numBranches = branchesList.length
    const base = Math.floor(total / numBranches)
    let remainder = total % numBranches

    const desired: Record<string, number> = {}
    for (const b of branchesList) {
      desired[b.name] = base + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder--
    }

    // Read manual assignments directly from the single source of truth
    const activeManual: Record<string, string> = {}
    for (const [empId, a] of Object.entries(currentAssignments)) {
      if (a.isManual) activeManual[empId] = a.branchName
    }
    const manualAssignedIds = Object.keys(activeManual)
    const manualCount: Record<string, number> = {}
    for (const bn of Object.values(activeManual)) {
      if (!bn) continue
      manualCount[bn] = (manualCount[bn] || 0) + 1
    }

    // Ensure manual assignments are always honored: bump desired totals to at least manual counts
    for (const b of branchesList) {
      const name = b.name
      if ((manualCount[name] || 0) > (desired[name] || 0)) {
        desired[name] = manualCount[name]
      }
    }

    // If sum(desired) exceeds total because of manual bumps, reduce other branches (prefer branches without manual overrides)
    let sumDesired = Object.values(desired).reduce((s, v) => s + v, 0)
    if (sumDesired > total) {
      let extra = sumDesired - total

      // Build list of branches that can be reduced (those where desired > manualCount)
      const reducible = branchesList
        .map((b) => ({ name: b.name, reducible: (desired[b.name] || 0) - (manualCount[b.name] || 0) }))
        .filter((r) => r.reducible > 0)

      // Sort reducible branches by largest reducible first to reduce quickly
      reducible.sort((a, b) => b.reducible - a.reducible)

      for (const r of reducible) {
        if (extra <= 0) break
        const take = Math.min(r.reducible, extra)
        desired[r.name] = (desired[r.name] || 0) - take
        extra -= take
      }

      sumDesired = Object.values(desired).reduce((s, v) => s + v, 0)
      // If still extra (shouldn't happen because sum(manualCount) <= total), fall back to trimming evenly
      if (sumDesired > total) {
        let remainingExtra = sumDesired - total
        let i = 0
        while (remainingExtra > 0) {
          const b = branchesList[i % branchesList.length].name
          const minAllowed = manualCount[b] || 0
          if (desired[b] > minAllowed) {
            desired[b]--
            remainingExtra--
          }
          i++
        }
      }
    }

    // Shuffle remaining employees (those not manually assigned)
    const shuffle = <T,>(arr: T[]) => {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }
    const remaining = shuffle(lightweight.filter((e) => !manualAssignedIds.includes(String(e.id))))

    const assignedResults: Array<any> = []

    // First, apply manual assignments (always honored)
    for (const idStr of Object.keys(activeManual)) {
      const id = idStr
      const emp = lightweight.find((e) => String(e.id) === String(id))
      const branchName = activeManual[idStr]
      if (emp && branchName) {
        assignedResults.push({ ...emp, nextWeekBranch: branchName, nextWeekShift: emp.shift || "AM", isManual: true })
        // reduce desired immediately
        if (typeof desired[branchName] === "number") desired[branchName] = Math.max(0, desired[branchName] - 1)
      }
    }

    // Then assign remaining employees trying to avoid assigning them to their current branch
    for (const emp of remaining) {
      // find candidate branches with available slots
      const candidates = branchesList.filter((b) => (desired[b.name] || 0) > 0 && (!avoidSame || b.name !== emp.currentBranch))
      let pick: any = null
      if (candidates.length > 0) {
        pick = candidates[Math.floor(Math.random() * candidates.length)]
      } else if (avoidSame) {
        // No slot on a different branch — force pick a different branch anyway (shuffle trumps balance)
        const otherBranches = branchesList.filter((b) => b.name !== emp.currentBranch)
        if (otherBranches.length > 0) {
          pick = otherBranches[Math.floor(Math.random() * otherBranches.length)]
        } else {
          // Only one branch exists — can't avoid same
          const fallback = branchesList.find((b) => (desired[b.name] || 0) > 0)
          pick = fallback || branchesList[0]
        }
      } else {
        // fallback: pick any branch with remaining slots
        const fallback = branchesList.find((b) => (desired[b.name] || 0) > 0)
        pick = fallback || branchesList[Math.floor(Math.random() * branchesList.length)]
      }

      assignedResults.push({ ...emp, nextWeekBranch: pick.name, nextWeekShift: emp.shift || "AM" })

      // reduce desired count for the picked branch
      if (typeof desired[pick.name] === "number") desired[pick.name] = Math.max(0, desired[pick.name] - 1)
    }

    return assignedResults
  }

  // Legacy preview state — kept for backward compatibility with preview dialog UI
  const [rotatedEmployees, setRotatedEmployees] = useState<Array<any>>([])

  // Fetch Firestore branches and employees for scheduling persistence and UI
  const fetchFireData = async () => {
    try {
      const [b, e] = await Promise.all([getBranchesFromFirestore(), getEmployeesFromFirestore()])
      setFireBranches(b)
      setFireEmployees(e)
    } catch (err) {
      console.error("Error loading Firestore scheduling data:", err)
    }
  }

  // Fetch current week's manual overrides
  const fetchWeeklyOverrides = async () => {
    try {
      const today = formatDateLocal(new Date())
      const overrides = await getOverridesForWeek(today)
      setWeeklyOverrides(overrides)
    } catch (err) {
      console.error("Error fetching weekly overrides:", err)
    }
  }

  // Fetch actual attendance records for the current week
  const fetchWeekAttendance = async () => {
    try {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))

      const result: Record<string, Record<string, string>> = {}
      const fetches = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        const dateISO = formatDateLocal(d)
        // Only fetch for today and past days (not future)
        if (d <= today) {
          fetches.push(
            fetch(`/api/attendance?date=${dateISO}`, { cache: 'no-store' })
              .then(r => r.ok ? r.json() : [])
              .then((records: any[]) => {
                const lookup: Record<string, string> = {}
                if (Array.isArray(records)) {
                  for (const rec of records) {
                    lookup[String(rec.employeeId)] = rec.status
                  }
                }
                result[dateISO] = lookup
              })
          )
        }
      }
      await Promise.all(fetches)
      setWeekAttendance(result)
    } catch (err) {
      console.error("Error fetching week attendance:", err)
    }
  }

  // Single consolidated mount effect — all initial data loads in parallel
  useEffect(() => {
    Promise.all([
      fetchFireData(),
      fetchWeeklyOverrides(),
      fetchWeekSchedulesFromFirestore(),
      fetchCurrentWeekSchedule(),
      fetchWeekAttendance(),
    ])
  }, [])

  // Fetch current week's schedule and load it into currentAssignments
  const fetchCurrentWeekSchedule = async () => {
    try {
      const todayDate = new Date()
      const day = todayDate.getDay()
      const monday = new Date(todayDate)
      monday.setDate(todayDate.getDate() - day + (day === 0 ? -6 : 1))
      const mondayISO = formatDateLocal(monday)

      const foundSchedules = await getSchedulesForWeekFromFirestore(mondayISO)

      if (foundSchedules && foundSchedules.length > 0) {
        // Group schedules by date, keeping the latest per date
        const byDate: Record<string, any> = {}
        for (const sched of foundSchedules) {
          const dateKey = sched.scheduleFor || sched.date
          if (!dateKey) continue
          const existing = byDate[dateKey]
          if (!existing || new Date(sched.updatedAt || sched.createdAt || 0) > new Date(existing.updatedAt || existing.createdAt || 0)) {
            byDate[dateKey] = sched
          }
        }

        // Merge all per-date schedules into a unified rotation view.
        // Manual entries always override rotation entries for the same employee.
        const employeeMap: Record<string, any> = {}
        let latestDate: string | null = null

        for (const [dateKey, sched] of Object.entries(byDate) as [string, any][]) {
          if (!sched.branchAssignments || sched.branchAssignments.length === 0) continue
          if (!latestDate || dateKey > latestDate) latestDate = dateKey
          const isManualDoc = !!sched.manuallyScheduled // only true for single-day manual saves

          for (const branchAssignment of sched.branchAssignments) {
            for (const employee of branchAssignment.employees) {
              const empId = String(employee.employeeId)
              const isManual = employee.isManual || false
              const entry = {
                id: employee.employeeId,
                branchId: String(branchAssignment.branchId || ""),
                branchName: branchAssignment.branchName,
                isManual,
                shift: employee.shift || "AM",
              }
              // Manual entries always win over rotation entries
              if (isManual || !employeeMap[empId]) {
                employeeMap[empId] = entry
              }
            }
          }
        }

        if (Object.keys(employeeMap).length > 0) {
          const assignments: Record<string, { branchId: string; branchName: string; isManual: boolean; shift: string }> = {}
          for (const [empId, e] of Object.entries(employeeMap) as [string, any][]) {
            assignments[empId] = {
              branchId: e.branchId || "",
              branchName: e.branchName || "",
              isManual: e.isManual || false,
              shift: e.shift || "AM",
            }
          }
          setCurrentAssignments(assignments)
          if (latestDate) {
            const weekBounds = getWeekBoundsFromDate(latestDate)
            setAppliedScheduleWeek(weekBounds)
          }
        }
      }
    } catch (err) {
      console.error("Error fetching current week schedule:", err)
    }
  }

  // Fetch all schedules for the week organized by scheduleFor date
  const fetchWeekSchedulesFromFirestore = async () => {
    try {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
      const mondayISO = formatDateLocal(monday)

      // Single API call instead of 7 sequential per-day calls
      const allSchedules = await getSchedulesForWeekFromFirestore(mondayISO)

      const schedulesByDate: Record<string, any> = {}

      if (allSchedules && allSchedules.length > 0) {
        for (const sched of allSchedules) {
          const dateKey = sched.scheduleFor || sched.date
          if (!dateKey) continue

          // Keep only the most recent schedule per date
          const existing = schedulesByDate[dateKey]
          if (!existing || new Date(sched.updatedAt || sched.createdAt || 0) > new Date(existing.updatedAt || existing.createdAt || 0)) {
            // Transform flat assignments to branchAssignments if needed
            if (sched.assignments && !sched.branchAssignments) {
              const branchMap: Record<string, any> = {}
              for (const assignment of sched.assignments) {
                const branchName = assignment.branchName || "Unknown"
                if (!branchMap[branchName]) {
                  branchMap[branchName] = {
                    branchName,
                    branchId: assignment.branchId,
                    employees: []
                  }
                }
                branchMap[branchName].employees.push({
                  employeeId: assignment.employeeId,
                  employeeName: assignment.employeeName,
                  shift: assignment.shift || "AM"
                })
              }
              sched.branchAssignments = Object.values(branchMap)
            }

            schedulesByDate[dateKey] = sched
          }
        }
      }

      setWeekSchedules(schedulesByDate)
    } catch (err) {
      console.error("Error fetching week schedules:", err)
    }
  }

  // Generate next week's rotation preview (auto-updates when data changes)
  useEffect(() => {
    const generateNextWeekPreview = () => {
      const preview = generateRotation({ avoidSameBranch: true })
      setNextWeekRotationPreview(preview)
    }

    generateNextWeekPreview()

    // Update preview hourly (only needs to detect week change)
    const interval = setInterval(generateNextWeekPreview, 3600000)
    return () => clearInterval(interval)
  }, [crews.length, branchesList.length, fireEmployees.length])

  // Wrapped regenerate so we can show feedback and ensure UI updates
  const handleRegenerate = async () => {
    // Open confirmation modal instead of executing immediately
    setShowRegenerateConfirm(true)
  }

  const confirmRegenerate = async () => {
    try {
      // Snapshot current assignments (crew -> branchId|null)
      const snapshot = crews.map((c) => {
        const assigned = getAssignedBranch ? getAssignedBranch(c.id) : null
        return { crewId: c.id, prevBranchId: assigned ? assigned.id : null }
      })
      setLastAssignmentSnapshot(snapshot)

      // Generate rotation and apply
      const next = generateRotation({ avoidSameBranch: true })
      if (!next || next.length === 0) {
        showNotification("info", "Rotation Generated", "No assignments generated. Ensure branches and crews exist.")
        setShowRegenerateConfirm(false)
        return
      }

      // Store the generated rotation in the single source of truth
      const newAssignments: Record<string, { branchId: string; branchName: string; isManual: boolean; shift: string }> = {}
      for (const emp of next) {
        const branch = fireBranches.find((b: any) => b.branchName === emp.nextWeekBranch || b.name === emp.nextWeekBranch)
        newAssignments[String(emp.id)] = {
          branchId: branch ? String(branch.id) : "",
          branchName: emp.nextWeekBranch,
          isManual: !!emp.isManual,
          shift: emp.nextWeekShift || emp.shift || "AM",
        }
      }
      setCurrentAssignments(newAssignments)

      // Get today's ISO date for schedule persistence
      const todayISO = formatDateLocal(new Date())

      // Build assignments for the regenerated rotation
      const regeneratedAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string; shiftStart?: string; shiftEnd?: string; isManual?: boolean }> = []

      for (const emp of next) {
        // Search in fireBranches first (same source the rotation algo used), then fall back to store branches
        const targetBranch = fireBranches.find((b: any) => b.branchName === emp.nextWeekBranch || b.name === emp.nextWeekBranch)
          || branches.find((b: any) => b.branchName === emp.nextWeekBranch)
        if (targetBranch) {
          // update in-memory store assignment (keeps other app logic working)
          try {
            if (emp.storeCrewId) assignCrewToBranch(emp.storeCrewId, targetBranch.id)
          } catch (e) {
            console.warn("[Regenerate] assignCrewToBranch failed for", emp.id, targetBranch.id, e)
          }

          // Add to regenerated assignments
          const fireBranch = fireBranches.find((fb: any) => fb.branchName === emp.nextWeekBranch || fb.name === emp.nextWeekBranch)

          // try to match crew by email (prefer), then by name
          let fireCrew = null
          if (emp.email) {
            fireCrew = fireEmployees.find((fe: any) => (fe.email || "").toLowerCase() === (emp.email || "").toLowerCase())
          }
          if (!fireCrew) {
            fireCrew = fireEmployees.find((fe: any) => ((fe.firstName || "") === emp.firstName && (fe.surname || "") === emp.surname))
          }

          const employeeId = fireCrew ? String(fireCrew.id) : String(emp.id)
          const branchId = fireBranch ? String(fireBranch.id) : String(targetBranch.id)
          const branchName = fireBranch ? (fireBranch.branchName || fireBranch.name) : (targetBranch.branchName || targetBranch.name)
          const employeeName = `${emp.firstName} ${emp.surname}`

          const shiftType = emp.shift || "AM"
          regeneratedAssignments.push({
            employeeId,
            employeeName,
            branchId,
            branchName,
            shift: shiftType,
            isManual: !!emp.isManual,
            ...getShiftTimes(shiftType),
          })
        }
      }

      // Save regenerated assignments as 7 documents for the current week (one per day, Mon-Sun)
      if (regeneratedAssignments.length > 0) {
        try {
          const startTime = "07:00" // Default AM time for regenerated rotations

          // compute current week's Monday
          const today = new Date()
          const day = today.getDay()
          const currentMonday = new Date(today)
          currentMonday.setDate(today.getDate() - day + (day === 0 ? -6 : 1))

          const currentMondayISO = formatDateLocal(currentMonday)
          const currentSundayISO = (() => { const s = new Date(currentMonday); s.setDate(currentMonday.getDate()+6); return formatDateLocal(s) })()

          // Delete any existing schedules for current week (preserve manually scheduled ones)
          try {
            await deleteSchedulesForWeek(currentMondayISO, true)
          } catch (err) {
            console.warn("[Regenerate] Could not delete existing schedules for current week:", err)
          }

          // Batch-fetch remaining manual dates (1 call instead of 7)
          const manualDates = new Set<string>()
          try {
            const weekScheds = await getSchedulesForWeekFromFirestore(currentMondayISO)
            for (const s of weekScheds) {
              if (s.manuallyScheduled && s.scheduleFor) manualDates.add(s.scheduleFor)
            }
          } catch {}

          // Build assignment payload once (shared across all days)
          const assignmentPayload = regeneratedAssignments.map((a) => ({
            employeeId: a.employeeId,
            employeeName: a.employeeName,
            branchId: a.branchId,
            branchName: a.branchName,
            isPresent: false,
            isManual: a.isManual || false,
            shift: a.shift,
            shiftStart: a.shiftStart,
            shiftEnd: a.shiftEnd,
          }))

          // Save 7 schedule documents in parallel, skip manually scheduled dates
          const savePromises: Promise<string | null>[] = []
          for (let i = 0; i < 7; i++) {
            const d = new Date(currentMonday)
            d.setDate(currentMonday.getDate() + i)
            const dayISO = formatDateLocal(d)

            if (manualDates.has(dayISO)) continue

            savePromises.push(
              addScheduleToFirestore({
                date: currentMondayISO,
                scheduleFor: dayISO,
                time: startTime,
                weekStart: currentMondayISO,
                weekEnd: currentSundayISO,
                assignments: assignmentPayload,
              }).then(() => dayISO).catch(() => null)
            )
          }

          const results = await Promise.all(savePromises)
          const savedDates = results.filter(Boolean) as string[]

          if (savedDates.length > 0) {
            const branchNames = [...new Set(regeneratedAssignments.map((a) => a.branchName))].join(", ")
            showNotification("success", "Schedule Saved", `Regenerated schedule saved for ${savedDates.length} days (${savedDates[0]} - ${savedDates[savedDates.length - 1]}) for branches: ${branchNames}`)
            await sendScheduleNotifications(regeneratedAssignments, `${savedDates[0]} - ${savedDates[savedDates.length - 1]}`)

            // Sync employee branchId in users table so Dashboard reflects the new branch
            await syncEmployeeBranches(regeneratedAssignments)

            // Refresh employee data so the UI reflects updated branches
            await fetchFireData()
          } else {
            showNotification("info", "Save Warning", "Regenerated rotation could not be saved for the current week.")
          }
        } catch (err) {
          console.error("[Regenerate] Error saving schedules to Firestore:", err)
          showNotification("error", "Save Error", "Failed to save regenerated schedule to Firestore")
          throw err
        }
      } else {
        console.warn("[Regenerate] No assignments to save")
      }

      setShowRegenerateConfirm(false)
      setUndoAvailable(true)
      startGenerateCooldown()
      showNotification("success", "Rotation Applied", "Current schedules have been rotated successfully. You can undo within 10s.")

      // Refresh the week schedules display
      await fetchWeekSchedulesFromFirestore()

      // auto-clear undo after 10 seconds
      setTimeout(() => {
        setUndoAvailable(false)
        setLastAssignmentSnapshot([])
      }, 10000)
    } catch (err: any) {
      console.error("[Regenerate] Fatal error:", err)
      showNotification("error", "Rotation Error", err?.message || String(err))
      setShowRegenerateConfirm(false)
    }
  }

  const undoRegenerate = () => {
    if (!lastAssignmentSnapshot || lastAssignmentSnapshot.length === 0) {
      showNotification("info", "Nothing to Undo", "No previous assignment snapshot available.")
      return
    }

    // Revert per-crew to their previous branch if available. Note: unassign (null) cannot be restored automatically.
    for (const entry of lastAssignmentSnapshot) {
      if (entry.prevBranchId !== null) {
        assignCrewToBranch(entry.crewId, entry.prevBranchId)
      }
    }

    setUndoAvailable(false)
    setLastAssignmentSnapshot([])
    showNotification("success", "Undo Complete", "Previous assignments restored for crews that had a prior branch.")
  }

  // Note: explicit preview generation button was removed from the UI per user request.

  const handleManualAssignment = (employeeId: string | number, branchName: string) => {
    const key = String(employeeId)

    if (branchName === "Unassigned") {
      // Remove from currentAssignments — employee shows on no branch
      setCurrentAssignments(prev => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
      // Persist to MySQL
      updateEmployee(key, { branchId: null } as any).catch(err =>
        console.warn("Failed to unassign employee in DB:", err))
      return
    }

    const branch = fireBranches.find(b => b.branchName === branchName || b.name === branchName)
    setCurrentAssignments(prev => ({
      ...prev,
      [key]: {
        branchId: branch ? String(branch.id) : "",
        branchName,
        isManual: true,
        shift: prev[key]?.shift || "AM",
      }
    }))

    // Persist to MySQL
    if (branch) {
      updateEmployee(key, { branchId: String(branch.id) }).catch(err =>
        console.warn("Failed to update employee branch in DB:", err))
    }
  }

  // Legacy handler — kept for backward-compat; delegates to handleManualAssignment
  const handleAssignCrewFirestore = async (crewId: string | number, branchId: string, employee: any) => {
    if (!branchId) return
    if (branchId === "unassigned") {
      handleManualAssignment(employee.id, "Unassigned")
      showNotification("info", "Employee Unassigned", `${employee.firstName} ${employee.surname} has been unassigned.`)
    } else {
      const branch = fireBranches.find((b) => String(b.id) === branchId)
      if (branch) {
        handleManualAssignment(employee.id, branch.branchName || branch.name)
        showNotification("success", "Employee Assigned", `${employee.firstName} ${employee.surname} has been assigned to ${branch.branchName}.`)
      }
    }
  }

  const handleAssignCrew = async (crewId: number, branchId: string) => {
    if (branchId) {
      const crew = crews.find((c) => c.id === crewId)
      const branch = branchId === "unassigned" ? null : branches.find((b) => b.id.toString() === branchId)

      if (branchId === "unassigned") {
        // Persist branchId removal to MySQL
        if (crew) {
          try {
            await updateEmployee(String(crew.id), { branchId: null } as any)
          } catch (err) {
            console.error("Failed to unassign crew branch in DB:", err)
          }
        }

        showNotification(
          "info",
          "Crew Unassigned",
          crew ? `${crew.firstName} ${crew.surname} has been unassigned.` : "Crew member has been unassigned.",
        )
      } else {
        assignCrewToBranch(crewId, Number.parseInt(branchId))

        // Persist branchId to MySQL so attendance validation works
        if (crew) {
          try {
            await updateEmployee(String(crew.id), { branchId: branchId })
          } catch (err) {
            console.error("Failed to update crew branch in DB:", err)
          }
        }

        if (crew && branch) {
          showNotification(
            "success",
            "Crew Assigned",
            `${crew.firstName} ${crew.surname} has been assigned to ${branch.branchName}.`,
          )
        } else {
          showNotification("success", "Crew Assigned", "Crew member has been assigned to the branch.")
        }
      }
    }
  }

  const handleSaveSchedule = async () => {
    if (!selectedDate) {
      showNotification("error", "Validation Error", "Please select a date")
      return
    }

    try {
      // Build assignments directly from currentAssignments (single source of truth)
      const allAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string; shiftStart?: string; shiftEnd?: string; isManual?: boolean }> = []

      // Build assignments directly from currentAssignments (single source of truth)
      for (const [empId, assignment] of Object.entries(currentAssignments)) {
        const emp = fireEmployees.find(e => String(e.id) === empId)
        if (!emp) continue
        const employeeName = `${emp.firstName} ${emp.surname}`
        const shiftType = assignment.shift || "AM"
        allAssignments.push({
          employeeId: empId,
          employeeName,
          branchId: assignment.branchId,
          branchName: assignment.branchName,
          shift: shiftType,
          isManual: assignment.isManual,
          ...getShiftTimes(shiftType),
        })
      }

      // Save manual overrides for tracking
      for (const a of allAssignments.filter(a => a.isManual)) {
        try {
          const dayOfWeek = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })
          await saveManualOverride({
            employeeId: a.employeeId,
            employeeName: a.employeeName,
            date: selectedDate,
            dayOfWeek,
            overrideBranchId: a.branchId,
            overrideBranchName: a.branchName || "",
            shift: a.shift || "AM",
            reason: "Manual override for schedule",
          })
        } catch (err) {
          console.error("Error saving manual override:", err)
        }
      }

      // Save single document for the selected date (not the entire week)
      if (allAssignments.length > 0) {
        try {
          // Save single schedule document for the selected date
          // Save single schedule document for the selected date
          const currentTime = new Date().toTimeString().slice(0, 5)
          
          // Calculate week bounds for the selected date
          const weekBounds = getWeekBoundsFromDate(selectedDate)
          
          const savedId = await addScheduleToFirestore({
            date: selectedDate,
            scheduleFor: selectedDate,
            time: currentTime,
            weekStart: weekBounds.weekStart,
            weekEnd: weekBounds.weekEnd,
            manuallyScheduled: true, // Flag this as manually scheduled
            assignments: allAssignments.map((a) => ({
              employeeId: a.employeeId,
              employeeName: a.employeeName,
              branchId: a.branchId,
              branchName: a.branchName,
              isPresent: false,
              isManual: a.isManual || false,
              shift: a.shift,
              shiftStart: a.shiftStart,
              shiftEnd: a.shiftEnd,
            })),
          })

          const branchNames = [...new Set(allAssignments.map(a => a.branchName))].join(", ")
          showNotification("success", "Schedule Saved", `Manual schedule saved for ${selectedDate} with ${allAssignments.length} crew members across: ${branchNames}`)
          // Send notifications to employees about their new assignments
          await sendScheduleNotifications(allAssignments, selectedDate)

          // Sync employee branchId in users table so Dashboard reflects the correct branch
          await syncEmployeeBranches(allAssignments)

          // Refresh employee data so the UI reflects updated branches
          await fetchFireData()
          
          // Refresh the current week schedule display to show updated week bounds
          await fetchCurrentWeekSchedule()
          await fetchWeekSchedulesFromFirestore()
        } catch (err) {
          console.error("[Manual Schedule] Error saving schedule:", err)
          showNotification("error", "Save Error", "Failed to save schedule to Firestore")
          return
        }
      } else {
        showNotification("info", "No Assignments", "No crew members assigned for this schedule")
      }
    } catch (err) {
      console.error("[Manual Schedule] Error:", err)
      showNotification("error", "Save Error", "Failed to save schedule")
    }
  }

  // Helper function to get week start and end dates from any given date
    // ...existing code...
    // --- Auto-schedule rollover at end of week ---
    // This must come after all useState, helpers, and function declarations
    useEffect(() => {
      const getWeekBounds = (date: Date) => {
        const d = new Date(date)
        const day = d.getDay()
        const monday = new Date(d)
        monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        return { monday, sunday }
      }

      const checkAndPromoteSchedule = async () => {
        const today = new Date()
        const { monday: thisMonday, sunday: thisSunday } = getWeekBounds(today)
        const lastWeekMonday = new Date(thisMonday)
        lastWeekMonday.setDate(thisMonday.getDate() - 7)
        const lastWeekSunday = new Date(thisSunday)
        lastWeekSunday.setDate(thisSunday.getDate() - 7)

        if (today.getDay() === 1) {
          const thisMondayISO = formatDateLocal(thisMonday)
          const schedules = await getSchedulesForDateFromFirestore(thisMondayISO)
          if (!schedules || schedules.length === 0) {
            if (nextWeekRotationPreview && nextWeekRotationPreview.length > 0) {
              const assignments = nextWeekRotationPreview.map((emp: any) => {
                const shiftType = emp.nextWeekShift || "AM"
                const { shiftStart, shiftEnd } = getShiftTimes(shiftType)
                return {
                  employeeId: String(emp.id),
                  employeeName: `${emp.firstName} ${emp.surname}`,
                  branchId: branchesList.find((b) => b.name === emp.nextWeekBranch)?.id || "",
                  branchName: emp.nextWeekBranch,
                  isPresent: false,
                  isManual: emp.isManual || false,
                  shift: shiftType,
                  shiftStart,
                  shiftEnd,
                }
              })
              const weekStart = formatDateLocal(thisMonday)
              const weekEnd = formatDateLocal(thisSunday)
              for (let i = 0; i < 7; i++) {
                const d = new Date(thisMonday)
                d.setDate(thisMonday.getDate() + i)
                const dayISO = formatDateLocal(d)
                await addScheduleToFirestore({
                  date: weekStart,
                  scheduleFor: dayISO,
                  time: "07:00",
                  weekStart,
                  weekEnd,
                  assignments,
                })
              }
              setTimeout(() => {
                // Convert preview to currentAssignments format
                const newAssignments: Record<string, { branchId: string; branchName: string; isManual: boolean; shift: string }> = {}
                for (const emp of nextWeekRotationPreview) {
                  const branch = fireBranches.find((b: any) => b.branchName === emp.nextWeekBranch || b.name === emp.nextWeekBranch)
                  newAssignments[String(emp.id)] = {
                    branchId: branch ? String(branch.id) : "",
                    branchName: emp.nextWeekBranch,
                    isManual: !!emp.isManual,
                    shift: emp.nextWeekShift || emp.shift || "AM",
                  }
                }
                setCurrentAssignments(newAssignments)
                setAppliedScheduleWeek({ weekStart, weekEnd })
                const newPreview = generateRotation({ avoidSameBranch: true })
                setNextWeekRotationPreview(newPreview)
                showNotification("success", "Schedule Rollover", "This week's schedule has been auto-promoted from last week's preview.")
              }, 500)
            }
          }
        }
      }

      const interval = setInterval(() => {
        checkAndPromoteSchedule()
      }, 1000 * 60 * 60 * 24)
      checkAndPromoteSchedule()
      return () => clearInterval(interval)
    }, [nextWeekRotationPreview, branchesList])
  const getWeekBoundsFromDate = useCallback((dateStr: string) => {
    const parts = dateStr.split("-")
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const currentDay = date.getDay()
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const monday = new Date(date)
    monday.setDate(date.getDate() + daysToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return {
      weekStart: formatDateLocal(monday),
      weekEnd: formatDateLocal(sunday),
    }
  }, [])

  const currentWeekDates = useMemo(() => {
    const today = new Date()
    const currentDay = today.getDay()
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const monday = new Date(today)
    monday.setDate(today.getDate() + daysToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return `${fmt(monday)} - ${fmt(sunday)}`
  }, [])

  const nextWeekDates = useMemo(() => {
    const today = new Date()
    const currentDay = today.getDay()
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const currentMonday = new Date(today)
    currentMonday.setDate(today.getDate() + daysToMonday)
    const nextMonday = new Date(currentMonday)
    nextMonday.setDate(currentMonday.getDate() + 7)
    const nextSunday = new Date(nextMonday)
    nextSunday.setDate(nextMonday.getDate() + 6)
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return `${fmt(nextMonday)} - ${fmt(nextSunday)}`
  }, [])

  const nextMondayDate = useMemo(() => {
    const today = new Date()
    const currentDay = today.getDay()
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const currentMonday = new Date(today)
    currentMonday.setDate(today.getDate() + daysToMonday)
    const nextMonday = new Date(currentMonday)
    nextMonday.setDate(currentMonday.getDate() + 7)
    return nextMonday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  }, [])

  // Compute today's ISO string once per render (not per employee in loops)
  const todayISO = formatDateLocal(new Date())

  // Quick stats derived from state
  const assignedCount = useMemo(() => Object.keys(currentAssignments).length, [currentAssignments])
  const manualCount = useMemo(() => Object.values(currentAssignments).filter(a => a.isManual).length, [currentAssignments])
  const totalEmployees = useMemo(() => (fireEmployees?.length || crews.length), [fireEmployees, crews])


  // --- Drag-and-drop computed values and handlers ---

  // Unassigned employees: not in currentAssignments (and no DB branch fallback if no schedules loaded yet)
  const unassignedEmployees = useMemo(() => {
    const allEmps = (fireEmployees && fireEmployees.length > 0) ? fireEmployees : []
    const hasAssignments = Object.keys(currentAssignments).length > 0

    return allEmps.filter(emp => {
      const a = currentAssignments[String(emp.id)]
      if (a) return false // assigned via schedule
      if (!hasAssignments && emp.branchId) return false // DB branch fallback
      return true
    }).filter(emp => {
      if (!searchQuery) return true
      const name = `${emp.firstName} ${emp.surname}`.toLowerCase()
      return name.includes(searchQuery.toLowerCase())
    })
  }, [fireEmployees, currentAssignments, searchQuery])

  // Crew assigned to a specific branch (by name), filtered by search query
  const getCrewForBranchByName = useCallback((branchName: string) => {
    const allEmps = (fireEmployees && fireEmployees.length > 0) ? fireEmployees : []
    const hasAssignments = Object.keys(currentAssignments).length > 0
    const branch = fireBranches.find((b: any) => b.branchName === branchName || b.name === branchName)

    return allEmps.filter(emp => {
      const a = currentAssignments[String(emp.id)]
      if (a) return a.branchName === branchName
      if (!hasAssignments && emp.branchId && branch) return String(emp.branchId) === String(branch.id)
      return false
    }).filter(emp => {
      if (!searchQuery) return true
      const name = `${emp.firstName} ${emp.surname}`.toLowerCase()
      return name.includes(searchQuery.toLowerCase())
    })
  }, [fireEmployees, fireBranches, currentAssignments, searchQuery])

  // Handle duration dialog confirmation after a drag-and-drop assignment
  const handleDurationConfirm = async (duration: "today" | "rest_of_week" | "full_week") => {
    if (!pendingDrop) return
    setIsSavingDrop(true)

    // Apply assignment in memory immediately
    handleManualAssignment(pendingDrop.employeeId, pendingDrop.branchName)

    // Close the dialog
    setShowDurationDialog(false)
    const drop = { ...pendingDrop }
    setPendingDrop(null)

    // Determine dates to save
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const mondayISO = formatDateLocal(monday)
    const sundayISO = formatDateLocal(sunday)

    let datesToSave: string[] = []
    if (duration === "today") {
      datesToSave = [formatDateLocal(now)]
    } else if (duration === "rest_of_week") {
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          datesToSave.push(formatDateLocal(d))
        }
      }
      if (datesToSave.length === 0) datesToSave = [formatDateLocal(now)]
    } else { // full_week
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        datesToSave.push(formatDateLocal(d))
      }
    }

    // Build FULL assignment payload including the new drop
    const updatedAssignments = { ...currentAssignments }
    const branchObj = fireBranches.find((b: any) => b.branchName === drop.branchName || b.name === drop.branchName)
    updatedAssignments[drop.employeeId] = {
      branchId: drop.branchId || (branchObj ? String(branchObj.id) : ""),
      branchName: drop.branchName,
      isManual: true,
      shift: currentAssignments[drop.employeeId]?.shift || "AM",
    }

    const allAssignments = Object.entries(updatedAssignments).map(([empId, a]) => {
      const emp = fireEmployees.find((e: any) => String(e.id) === empId)
      if (!emp) return null
      const shiftType = a.shift || "AM"
      return {
        employeeId: empId,
        employeeName: `${emp.firstName} ${emp.surname}`,
        branchId: a.branchId,
        branchName: a.branchName,
        isPresent: false,
        isManual: a.isManual || false,
        shift: shiftType,
        ...getShiftTimes(shiftType),
      }
    }).filter((x): x is NonNullable<typeof x> => x !== null)

    try {
      const currentTime = new Date().toTimeString().slice(0, 5)
      const savePromises = datesToSave.map(dateISO =>
        addScheduleToFirestore({
          date: mondayISO,
          scheduleFor: dateISO,
          time: currentTime,
          weekStart: mondayISO,
          weekEnd: sundayISO,
          manuallyScheduled: true,
          assignments: allAssignments,
        }).catch(err => {
          console.error(`Failed to save schedule for ${dateISO}:`, err)
          return null
        })
      )

      const results = await Promise.all(savePromises)
      const savedCount = results.filter(Boolean).length

      const durationLabel = duration === "today" ? "today" : duration === "rest_of_week" ? "rest of the week" : "the full week"
      showNotification("success", "Assignment Saved",
        `${drop.employeeName} \u2192 ${drop.branchName} for ${durationLabel} (${savedCount} day${savedCount > 1 ? "s" : ""})`)

      // Sync employee branchId in users table
      if (drop.branchId) {
        await updateEmployee(drop.employeeId, { branchId: drop.branchId }).catch(() => {})
      }

      // Note: We do NOT save manual overrides for drag-and-drop assignments.
      // Manual overrides are tracked for absences/leave — reassignments are NOT absences.
      // The schedule document itself already records the new assignment.

      // Send notifications
      await sendScheduleNotifications(
        [{ employeeId: drop.employeeId, employeeName: drop.employeeName, branchName: drop.branchName, shift: updatedAssignments[drop.employeeId]?.shift || "AM" }],
        datesToSave.length === 1 ? datesToSave[0] : `${datesToSave[0]} - ${datesToSave[datesToSave.length - 1]}`
      )

      // Refresh
      await fetchWeekSchedulesFromFirestore()
      await fetchFireData()
    } catch (err) {
      console.error("[DnD] Error saving assignment:", err)
      showNotification("error", "Save Error", "Failed to save assignment")
    } finally {
      setIsSavingDrop(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Crew Scheduling</h1>
          <p className="text-muted-foreground text-sm">
            Drag and drop crew members to assign branches &bull; {currentWeekDates}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {appliedScheduleWeek && (
            <Badge variant="outline" className="text-sm py-1.5 px-3 border-green-300 text-green-700 dark:text-green-400 bg-green-50/50 dark:bg-green-950/20">
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Schedule Saved
            </Badge>
          )}
          {manualCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={isSavingDrop}
              onClick={async () => {
                // 1. Update client state
                setCurrentAssignments(prev => {
                  const updated = { ...prev }
                  for (const key of Object.keys(updated)) {
                    if (updated[key].isManual) {
                      updated[key] = { ...updated[key], isManual: false }
                    }
                  }
                  return updated
                })
                // 2. Persist to Firestore — re-save all week schedules with isManual cleared
                try {
                  const todayISO = formatDateLocal(new Date())
                  const { weekStart, weekEnd } = getWeekBoundsFromDate(todayISO)
                  const weekScheds = await getSchedulesForWeekFromFirestore(weekStart)
                  const saves = weekScheds.map(sched => {
                    const cleared = {
                      ...sched,
                      assignments: (sched.assignments || []).map((a: any) => ({ ...a, isManual: false })),
                    }
                    // Also clear in branchAssignments if present
                    if ((sched as any).branchAssignments) {
                      (cleared as any).branchAssignments = (sched as any).branchAssignments.map((ba: any) => ({
                        ...ba,
                        employees: (ba.employees || []).map((e: any) => ({ ...e, isManual: false })),
                      }))
                    }
                    return addScheduleToFirestore({
                      date: cleared.date,
                      scheduleFor: cleared.scheduleFor,
                      time: cleared.time,
                      weekStart: cleared.weekStart,
                      weekEnd: cleared.weekEnd,
                      manuallyScheduled: cleared.manuallyScheduled,
                      assignments: (cleared.assignments || []).map((a: any) => ({
                        employeeId: a.employeeId,
                        employeeName: a.employeeName,
                        branchId: a.branchId,
                        branchName: a.branchName,
                        isPresent: a.isPresent || false,
                        isManual: false,
                        shift: a.shift,
                        shiftStart: a.shiftStart,
                        shiftEnd: a.shiftEnd,
                      })),
                    }).catch(err => console.error("Reset manual save error:", err))
                  })
                  await Promise.all(saves)
                  showNotification("success", "Manual Reset", "All manual flags cleared and saved")
                } catch (err) {
                  console.error("Error resetting manual flags in Firestore:", err)
                  showNotification("error", "Reset Error", "Manual flags cleared locally but failed to persist")
                }
              }}
            >
              <X className="h-4 w-4 mr-1.5" />
              Reset Manual ({manualCount})
            </Button>
          )}
          <Button
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={branchesList.length === 0 || !hasAnyEmployees || generateCooldown > 0}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {generateCooldown > 0 ? `Wait ${generateCooldown}s` : "Generate Rotation"}
          </Button>
        </div>
      </div>

      {/* Help banner (dismissible) */}
      {showHelp && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm text-blue-700 dark:text-blue-400">
            <strong>How it works:</strong> Drag crew members from the <em>Unassigned</em> pool to a branch column, or between branches. Choose how long the assignment lasts. Use <strong>Generate Rotation</strong> to auto-assign everyone.
          </div>
          <button
            onClick={() => { setShowHelp(false); localStorage.setItem("scheduling-help-dismissed", "1") }}
            className="text-blue-400 hover:text-blue-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-card">
          <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/40">
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-none">{totalEmployees}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Crew</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-card">
          <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/40">
            <Building2 className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-none">{assignedCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Assigned</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-card">
          <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-none">{totalEmployees - assignedCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Unassigned</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-card">
          <div className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/40">
            <ArrowRightLeft className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-none">{manualCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Manual</div>
          </div>
        </div>
      </div>

      {/* Undo indicator */}
      {undoAvailable && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400">Rotation applied. You can undo within 10 seconds.</span>
          <Button variant="ghost" size="sm" onClick={undoRegenerate}>Undo</Button>
        </div>
      )}

      {/* Search bar with clear button */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search crew members..."
          className="pl-10 pr-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Saving overlay */}
      {isSavingDrop && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex items-center gap-3 bg-card border shadow-lg rounded-xl px-6 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Saving assignment...</span>
          </div>
        </div>
      )}

      {/* Drag-and-drop assignment board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Unassigned pool */}
        <Card
          className={`border-2 border-dashed transition-all duration-200 ${
            dragOverBranch === "__unassigned__"
              ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 scale-[1.01]"
              : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverBranch("__unassigned__") }}
          onDragLeave={() => setDragOverBranch(null)}
          onDrop={async (e) => {
            e.preventDefault()
            setDragOverBranch(null)
            let dragged = draggedEmployeeRef.current
            if (!dragged) {
              try { dragged = JSON.parse(e.dataTransfer.getData("text/plain")) } catch {}
            }
            if (!dragged) return
            draggedEmployeeRef.current = null
            setDraggedEmployee(null)

            // Update in-memory state + MySQL
            handleManualAssignment(dragged.id, "Unassigned")

            // Also persist to Firestore so it survives refresh
            try {
              const now = new Date()
              const dow = now.getDay()
              const mon = new Date(now); mon.setDate(now.getDate() - dow + (dow === 0 ? -6 : 1))
              const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
              const monISO = formatDateLocal(mon)
              const sunISO = formatDateLocal(sun)
              const nowISO = formatDateLocal(now)

              // Build updated assignment list with this employee removed
              const updated = { ...currentAssignments }
              delete updated[dragged.id]
              const payload = Object.entries(updated).map(([eid, a]) => {
                const emp = fireEmployees.find((fe: any) => String(fe.id) === eid)
                if (!emp) return null
                const st = a.shift || "AM"
                return { employeeId: eid, employeeName: `${emp.firstName} ${emp.surname}`, branchId: a.branchId, branchName: a.branchName, isPresent: false, isManual: a.isManual || false, shift: st, ...getShiftTimes(st) }
              }).filter((x): x is NonNullable<typeof x> => x !== null)

              // Save for rest of week from today
              const saves: Promise<any>[] = []
              for (let i = 0; i < 7; i++) {
                const d = new Date(mon); d.setDate(mon.getDate() + i)
                if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
                  const dISO = formatDateLocal(d)
                  saves.push(addScheduleToFirestore({ date: monISO, scheduleFor: dISO, time: new Date().toTimeString().slice(0, 5), weekStart: monISO, weekEnd: sunISO, manuallyScheduled: true, assignments: payload }).catch(() => null))
                }
              }
              await Promise.all(saves)
              await fetchWeekSchedulesFromFirestore()
            } catch (err) {
              console.warn("[Unassign] Firestore save failed:", err)
            }

            showNotification("info", "Unassigned", `${dragged.name} has been unassigned.`)
          }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-500" />
                Unassigned
              </CardTitle>
              <Badge variant="secondary" className="text-xs">{unassignedEmployees.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-[450px] overflow-y-auto pr-1">
              {unassignedEmployees.map(emp => (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={(e) => {
                    const data = { id: String(emp.id), name: `${emp.firstName} ${emp.surname}`, fromBranch: null }
                    draggedEmployeeRef.current = data
                    setDraggedEmployee(data)
                    e.dataTransfer.effectAllowed = "move"
                    e.dataTransfer.setData("text/plain", JSON.stringify(data))
                  }}
                  onDragEnd={() => { draggedEmployeeRef.current = null; setDraggedEmployee(null) }}
                  className={`p-2.5 border rounded-lg bg-card cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none ${
                    draggedEmployee?.id === String(emp.id) ? "opacity-40 scale-95" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{emp.firstName} {emp.surname}</div>
                      {emp.email && <div className="text-[10px] text-muted-foreground truncate">{emp.email}</div>}
                    </div>
                  </div>
                </div>
              ))}
              {unassignedEmployees.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  {searchQuery ? "No matches" : (
                    <div className="space-y-1">
                      <CheckCircle className="h-5 w-5 mx-auto text-green-500 mb-1" />
                      <div>All crew assigned</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Branch columns */}
        {branchesList.map(branch => {
          const assignedCrew = getCrewForBranchByName(branch.name)
          const isOver = dragOverBranch === branch.name

          return (
            <Card
              key={branch.id}
              className={`border-2 transition-all duration-200 ${
                isOver
                  ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 scale-[1.01]"
                  : "border-border"
              }`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverBranch(branch.name) }}
              onDragLeave={() => setDragOverBranch(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverBranch(null)
                let dragged = draggedEmployeeRef.current
                if (!dragged) {
                  try { dragged = JSON.parse(e.dataTransfer.getData("text/plain")) } catch {}
                }
                if (!dragged) return
                if (dragged.fromBranch === branch.name) { draggedEmployeeRef.current = null; setDraggedEmployee(null); return }
                setPendingDrop({
                  employeeId: dragged.id,
                  employeeName: dragged.name,
                  branchId: String(branch.id),
                  branchName: branch.name,
                })
                setShowDurationDialog(true)
                draggedEmployeeRef.current = null
                setDraggedEmployee(null)
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{branch.name}</CardTitle>
                    {branch.address && <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5"><MapPin className="h-2.5 w-2.5 flex-shrink-0" />{branch.address}</div>}
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0 ml-2">{assignedCrew.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 min-h-[60px]">
                  {assignedCrew.map(emp => {
                    const assignment = currentAssignments[String(emp.id)]
                    return (
                      <div
                        key={emp.id}
                        draggable
                        onDragStart={(e) => {
                          const data = { id: String(emp.id), name: `${emp.firstName} ${emp.surname}`, fromBranch: branch.name }
                          draggedEmployeeRef.current = data
                          setDraggedEmployee(data)
                          e.dataTransfer.effectAllowed = "move"
                          e.dataTransfer.setData("text/plain", JSON.stringify(data))
                        }}
                        onDragEnd={() => { draggedEmployeeRef.current = null; setDraggedEmployee(null) }}
                        className={`p-2.5 border rounded-lg bg-card cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none ${
                          draggedEmployee?.id === String(emp.id) ? "opacity-40 scale-95" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{emp.firstName} {emp.surname}</div>
                            {emp.email && <div className="text-[10px] text-muted-foreground truncate">{emp.email}</div>}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  const key = String(emp.id)
                                  setCurrentAssignments(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], shift: prev[key]?.shift === "PM" ? "AM" : "PM" }
                                  }))
                                }}
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                                  (assignment?.shift || "AM") === "AM"
                                    ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-700"
                                    : "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-700"
                                }`}
                                draggable={false}
                                title="Click to toggle AM/PM"
                              >
                                {(assignment?.shift || "AM") === "AM" ? "\u2600 AM" : "\u263D PM"}
                              </button>
                              {assignment?.isManual && (
                                <span className="text-[10px] text-amber-600 font-medium bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5 rounded">Manual</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {assignedCrew.length === 0 && !isOver && (
                    <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg text-muted-foreground gap-1.5">
                      <Users className="h-5 w-5 opacity-30" />
                      <span className="text-xs">Drop crew here</span>
                    </div>
                  )}
                  {isOver && assignedCrew.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-blue-400 rounded-lg text-blue-500 bg-blue-50/50 dark:bg-blue-950/30 gap-1.5">
                      <ArrowRightLeft className="h-5 w-5" />
                      <span className="text-xs font-medium">Release to assign</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* No branches / no employees warning */}
      {(branchesList.length === 0 || !hasAnyEmployees) && (
        <div className="text-center py-8 text-sm text-amber-600 border rounded-lg bg-amber-50/50 dark:bg-amber-950/30">
          {branchesList.length === 0
            ? "No branches configured. Add branches in Branch Management to start scheduling."
            : "No crew members available. Add or enable crew members to begin."}
        </div>
      )}

      {/* Schedule Details by Day */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule Details by Day
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(weekSchedules).length > 0 ? (
            <div className="space-y-2">
              {(() => {
                const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                const today = new Date()
                const dayOfWeek = today.getDay()
                const monday = new Date(today)
                monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))

                const details = []

                for (let i = 0; i < 7; i++) {
                  const currentDate = new Date(monday)
                  currentDate.setDate(monday.getDate() + i)
                  const dayName = days[i]
                  const dateStr = currentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  const dateISO = formatDateLocal(currentDate)
                  const isExpanded = expandedDays.has(i)

                  const schedule = weekSchedules[dateISO]
                  if (!schedule) continue

                  const assignments = schedule.branchAssignments || []
                  const totalCrew = assignments.reduce((sum: number, ba: any) => sum + (ba.employees?.length || 0), 0)
                  const dayAttendance = weekAttendance[dateISO]
                  const dateOverrides = weeklyOverrides.filter((o: any) => o.date === dateISO)
                  const uniqueAbsentIds = new Set<string>()
                  if (dayAttendance && Object.keys(dayAttendance).length > 0) {
                    assignments.forEach((ba: any) => {
                      (ba.employees || []).forEach((emp: any) => {
                        const status = dayAttendance[String(emp.employeeId)]
                        // Only count as absent if the attendance record explicitly says so
                        if (status && status === "absent") {
                          uniqueAbsentIds.add(String(emp.employeeId))
                        }
                      })
                    })
                  }
                  // Note: overrides are reassignment records, NOT absence markers
                  const absentCount = uniqueAbsentIds.size
                  const presentIds = new Set<string>()
                  if (dayAttendance && Object.keys(dayAttendance).length > 0) {
                    assignments.forEach((ba: any) => {
                      (ba.employees || []).forEach((emp: any) => {
                        if (dayAttendance[String(emp.employeeId)] === "present") presentIds.add(String(emp.employeeId))
                      })
                    })
                  }
                  const presentCount = presentIds.size
                  const isToday = dateISO === todayISO

                  details.push(
                    <div key={i} className={`border rounded-lg ${isToday ? "ring-2 ring-blue-400 bg-blue-50/30 dark:bg-blue-950/20" : ""}`}>
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedDays)
                          if (newExpanded.has(i)) { newExpanded.delete(i) } else { newExpanded.add(i) }
                          setExpandedDays(newExpanded)
                        }}
                        className="w-full flex items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1 text-left">
                          <div className="text-sm font-medium">{dayName}, {dateStr} {isToday ? "(Today)" : ""}</div>
                          <div className="text-xs text-muted-foreground">({totalCrew} crew{presentCount > 0 ? `, ${presentCount} present` : ""}{absentCount > 0 ? `, ${absentCount} absent` : ""})</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{isExpanded ? "\u25BC" : "\u25B6"}</div>
                      </button>

                      {isExpanded && (
                        <div className="border-t p-3 space-y-3 bg-muted/20">
                          {assignments.map((branchAssignment: any) => (
                            <div key={branchAssignment.branchName}>
                              <div className="text-xs font-medium text-muted-foreground mb-1.5">{branchAssignment.branchName}</div>
                              <div className="space-y-1">
                                {(branchAssignment.employees || []).map((employee: any) => {
                                  const dayAtt = weekAttendance[dateISO]
                                  const attStatus = dayAtt?.[String(employee.employeeId)]

                                  let status: string
                                  let statusColor: string
                                  if (attStatus === "present") { status = "Present"; statusColor = "text-green-600" }
                                  else if (attStatus === "absent") { status = "Absent"; statusColor = "text-red-600" }
                                  else {
                                    // No attendance record — determine status from date context
                                    const dateObj = new Date(dateISO + "T00:00:00")
                                    const todayObj = new Date()
                                    todayObj.setHours(0, 0, 0, 0)
                                    if (dateObj < todayObj) { status = "No Record"; statusColor = "text-gray-500" }
                                    else if (dateObj.getTime() === todayObj.getTime()) {
                                      status = "Not Clocked In"; statusColor = "text-amber-600"
                                    } else { status = "Scheduled"; statusColor = "text-blue-600" }
                                  }
                                  const displayBranch = branchAssignment.branchName

                                  return (
                                    <div key={employee.employeeId} className="flex items-center justify-between text-xs p-1.5 rounded bg-background border">
                                      <div className="flex-1">
                                        <div className="font-medium">{employee.employeeName}</div>
                                        <div className="text-muted-foreground">{employee.shift || "AM"} Shift</div>
                                      </div>
                                      <div className="text-right">
                                        <div className={`font-medium ${statusColor}`}>{status}</div>
                                        {displayBranch && <div className="text-muted-foreground text-xs">{displayBranch}</div>}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
                return details.filter(Boolean)
              })()}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No schedules saved yet. Generate a rotation or drag crew to branches to create schedules.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Duration Dialog - shown after dropping a crew member on a branch */}
      <Dialog open={showDurationDialog} onOpenChange={(open) => { if (!open) { setShowDurationDialog(false); setPendingDrop(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Duration</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              How long should <span className="font-semibold">{pendingDrop?.employeeName}</span> be assigned to <span className="font-semibold">{pendingDrop?.branchName}</span>?
            </p>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Button
              variant="outline"
              className="w-full justify-start h-12"
              disabled={isSavingDrop}
              onClick={() => handleDurationConfirm("today")}
            >
              <Calendar className="h-4 w-4 mr-3 flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Today only</div>
                <div className="text-xs text-muted-foreground">
                  Just for {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-12"
              disabled={isSavingDrop}
              onClick={() => handleDurationConfirm("rest_of_week")}
            >
              <Calendar className="h-4 w-4 mr-3 flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Rest of this week</div>
                <div className="text-xs text-muted-foreground">Today through Sunday</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-12"
              disabled={isSavingDrop}
              onClick={() => handleDurationConfirm("full_week")}
            >
              <Calendar className="h-4 w-4 mr-3 flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Full week</div>
                <div className="text-xs text-muted-foreground">Monday through Sunday</div>
              </div>
            </Button>
          </div>
          {isSavingDrop && (
            <div className="text-xs text-center text-muted-foreground pt-2">Saving...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation Dialog */}
      <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate New Rotation?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              This will generate a new crew rotation for the current week. Manually scheduled days will be preserved.
              {Object.values(currentAssignments).filter(a => a.isManual).length > 0 && (
                <span className="block mt-1 text-amber-600">
                  {Object.values(currentAssignments).filter(a => a.isManual).length} manual assignment(s) will be respected in the rotation.
                </span>
              )}
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>Cancel</Button>
            <Button onClick={confirmRegenerate}>Yes, Generate</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNotification } from "@/components/notification-provider"
import { useCrewStore } from "@/lib/cleanStore"
import { getAllBranches as getBranchesFromFirestore } from "@/lib/firestore-branch-service"
import { getActiveEmployees as getEmployeesFromFirestore } from "@/lib/firestore-employee-service"
import { addSchedule as addScheduleToFirestore, getSchedulesForDate as getSchedulesForDateFromFirestore, getSchedulesForWeek as getSchedulesForWeekFromFirestore, deleteSchedulesForWeek } from "@/lib/firestore-schedule-service"
import { saveManualOverride, getOverridesForWeek } from "@/lib/firestore-manual-override-service"
import { updateEmployee } from "@/lib/firestore-employee-service"
import { Search, RotateCcw, Edit, Calendar, Users, AlertTriangle, Clock } from "lucide-react"

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
  
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({})
  const [appliedRotation, setAppliedRotation] = useState<any[]>([])

  // Helper function to get employees for a specific branch — uses schedule, manual assignments, and DB
  const getFirestoreEmployeesForBranch = useCallback((branchId: string | number) => {
    const branch = fireBranchMap.get(String(branchId))
    const branchName = branch?.branchName
    if (!branchName) return []

    // Build a map of employee → assigned branch from appliedRotation (schedule source of truth)
    const scheduleBranchMap = new Map<string, string>()
    for (const emp of appliedRotation) {
      if (emp.nextWeekBranch) scheduleBranchMap.set(String(emp.id), emp.nextWeekBranch)
    }

    // Priority: manualAssignments > appliedRotation > employee.branchId
    const result: any[] = []
    const addedIds = new Set<string>()

    for (const emp of fireEmployees) {
      const empId = String(emp.id)
      const manualBranch = manualAssignments[empId]
      const scheduleBranch = scheduleBranchMap.get(empId)

      let effectiveBranch: string | undefined
      if (manualBranch) {
        effectiveBranch = manualBranch
      } else if (scheduleBranch) {
        effectiveBranch = scheduleBranch
      } else if (emp.branchId && String(emp.branchId) === String(branchId)) {
        effectiveBranch = branchName
      }

      if (effectiveBranch === branchName && !addedIds.has(empId)) {
        result.push(emp)
        addedIds.add(empId)
      }
    }

    return result
  }, [fireBranchMap, fireEmployees, manualAssignments, appliedRotation])
  
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

  const generateRotation = (opts?: { avoidSameBranch?: boolean }) => {
    // Prefer Firestore employees for preview/rotation when available; fall back to store crews
    const sourceEmployees = (fireEmployees && fireEmployees.length > 0) ? fireEmployees : crews

    // Build a lightweight employee view; try to preserve a link to the in-store crew id when possible
    const lightweight = sourceEmployees.map((c: any, idx: number) => {
      // find matching store crew by email or name to get assigned branch and numeric id for assignments
      const matchedStoreCrew = crews.find((sc) => {
        if (c.email && sc.email) return (c.email || "").toLowerCase() === (sc.email || "").toLowerCase()
        return (sc.firstName === c.firstName && sc.surname === c.surname)
      })

      const assignedBranch = matchedStoreCrew && getAssignedBranch ? getAssignedBranch(matchedStoreCrew.id) : null
      const storeCrewId = matchedStoreCrew ? matchedStoreCrew.id : null

      return {
        id: c.id ?? `fire-${idx}`,       // Always use Firestore ID (matches manualAssignments keys)
        storeCrewId,                       // Store crew ID for assignCrewToBranch calls
        firstName: c.firstName,
        surname: c.surname,
        email: c.email,
        currentBranch: assignedBranch ? assignedBranch.branchName : "Unassigned",
        shift: "AM",
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

    // Manual assignments count per branch (keys are string IDs)
    // Merge manual flags from appliedRotation (persisted schedule) into manualAssignments
    // so that isManual employees are properly excluded even after "Apply Rotation" clears the state
    const effectiveManual: Record<string, string> = { ...manualAssignments }
    for (const emp of appliedRotation) {
      if (emp.isManual && emp.nextWeekBranch && !effectiveManual[String(emp.id)]) {
        effectiveManual[String(emp.id)] = emp.nextWeekBranch
      }
    }
    const manualAssignedIds = Object.keys(effectiveManual).map((k) => String(k))
    const manualCount: Record<string, number> = {}
    for (const idStr of Object.keys(effectiveManual)) {
      const bn = effectiveManual[idStr]
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

    // First, apply manual assignments (always honor — uses effectiveManual which includes persisted isManual)
    for (const idStr of Object.keys(effectiveManual)) {
      const id = idStr
      const emp = lightweight.find((e) => String(e.id) === String(id))
      const branchName = effectiveManual[idStr]
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

  // rotatedEmployees holds a preview (if any). Start empty so the app does NOT automatically shuffle on reload.
  // Note: previews are not auto-generated; Regenerate updates current assignments directly.
  const [rotatedEmployees, setRotatedEmployees] = useState<Array<any>>([])

  // Clear any existing preview when the underlying store data changes (so a stale preview
  // isn't shown after branches/crews are edited). Do NOT regenerate automatically.
  useEffect(() => {
    setRotatedEmployees([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crews.length, branchesList.length])

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

  // Fetch current week's schedule and load it into appliedRotation
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
        const restoredManual: Record<string, string> = {}
        let latestDate: string | null = null

        for (const [dateKey, sched] of Object.entries(byDate) as [string, any][]) {
          if (!sched.branchAssignments || sched.branchAssignments.length === 0) continue
          if (!latestDate || dateKey > latestDate) latestDate = dateKey

          for (const branchAssignment of sched.branchAssignments) {
            for (const employee of branchAssignment.employees) {
              const empId = String(employee.employeeId)
              const isManual = employee.isManual || false
              const entry = {
                id: employee.employeeId,
                firstName: employee.employeeName ? employee.employeeName.split(" ")[0] : "Unknown",
                surname: employee.employeeName ? employee.employeeName.split(" ").slice(1).join(" ") : "",
                nextWeekBranch: branchAssignment.branchName,
                nextWeekShift: employee.shift || "AM",
                isManual,
              }
              // Manual entries always win over rotation entries
              if (isManual || !employeeMap[empId]) {
                employeeMap[empId] = entry
              }
              // Collect ALL isManual flags from every schedule doc
              if (isManual) {
                restoredManual[empId] = branchAssignment.branchName
              }
            }
          }
        }

        const rotationData = Object.values(employeeMap)
        if (rotationData.length > 0) {
          setAppliedRotation(rotationData)
          if (Object.keys(restoredManual).length > 0) {
            setManualAssignments((prev) => ({ ...prev, ...restoredManual }))
          }
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

      // Store the generated rotation to display in Current Schedules card
      setAppliedRotation(next)

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
    // Replace semantics: assigning Employee X to Branch B clears any OTHER employee's
    // manual assignment to Branch B (single-slot-per-branch for manual overrides).
    setManualAssignments((prev) => {
      const updated: Record<string, string> = {}
      for (const [empId, branch] of Object.entries(prev)) {
        if (branch === branchName && empId !== key) continue // evict previous occupant
        updated[empId] = branch
      }
      updated[key] = branchName
      return updated
    })
    setPendingAssignments((prev) => {
      const updated: Record<string, string> = {}
      for (const [empId, branch] of Object.entries(prev)) {
        if (branch === branchName && empId !== key) continue
        updated[empId] = branch
      }
      updated[key] = branchName
      return updated
    })
    setRotatedEmployees((prev) =>
      prev.map((emp) => (String(emp.id) === key ? { ...emp, nextWeekBranch: branchName } : emp)),
    )
  }

  const handleAssignCrewFirestore = async (crewId: string | number, branchId: string, employee: any) => {
    if (branchId) {
      const branch = branchId === "unassigned" ? null : fireBranches.find((b) => String(b.id) === branchId)

      if (branchId === "unassigned") {
        // Remove any local manual assignment for this employee
        setManualAssignments((prev) => {
          const copy = { ...prev }
          delete copy[String(employee.id)]
          return copy
        })

        // Persist branchId removal to MySQL
        try {
          await updateEmployee(String(employee.id), { branchId: null } as any)
        } catch (err) {
          console.error("Failed to unassign employee branch in DB:", err)
        }

        showNotification(
          "info",
          "Employee Unassigned",
          `${employee.firstName} ${employee.surname} has been unassigned.`,
        )
      } else {
        // Save manual assignment locally — replace semantics: clear previous manual occupant of this branch
        const branchName = branch ? branch.branchName : null
        const targetName = branchName || String(branchId)
        const empKey = String(employee.id)
        setManualAssignments((prev) => {
          const updated: Record<string, string> = {}
          for (const [id, bname] of Object.entries(prev)) {
            if (bname === targetName && id !== empKey) continue // evict previous occupant
            updated[id] = bname
          }
          updated[empKey] = targetName
          return updated
        })

        // Persist branchId to MySQL so attendance validation works
        try {
          await updateEmployee(String(employee.id), { branchId: branchId })
        } catch (err) {
          console.error("Failed to update employee branch in DB:", err)
        }

        // Try to find matching store crew and assign via store for backward compatibility
        const matchedStore = crews.find((sc) => {
          if (employee.email && sc.email) return (employee.email || "").toLowerCase() === (sc.email || "").toLowerCase()
          return sc.firstName === employee.firstName && sc.surname === employee.surname
        })

        if (matchedStore && typeof crewId === "number") {
          assignCrewToBranch(crewId as number, Number.parseInt(branchId))
        }

        if (branch) {
          showNotification(
            "success",
            "Employee Assigned",
            `${employee.firstName} ${employee.surname} has been assigned to ${branch.branchName}.`,
          )
        } else {
          showNotification("success", "Employee Assigned", "Employee has been assigned to the branch.")
        }
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
      // Build complete assignments array (rotated + manual)
      const allAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string; shiftStart?: string; shiftEnd?: string; isManual?: boolean }> = []

      // Add rotated employees if any
      if (rotatedEmployees && rotatedEmployees.length > 0) {
        for (const emp of rotatedEmployees) {
          const fireBranch = fireBranches.find((fb: any) => fb.branchName === emp.nextWeekBranch || fb.name === emp.nextWeekBranch)

          let fireCrew = null
          if ((emp as any).email) {
            fireCrew = fireEmployees.find((fe: any) => (fe.email || "").toLowerCase() === ((emp as any).email || "").toLowerCase())
          }
          if (!fireCrew) {
            fireCrew = fireEmployees.find((fe: any) => ((fe.firstName || "") === emp.firstName && (fe.surname || "") === emp.surname))
          }

          const employeeId = fireCrew ? String(fireCrew.id) : String(emp.id)
          const branchId = fireBranch ? String(fireBranch.id) : String(emp.nextWeekBranch)
          const branchName = fireBranch ? (fireBranch.branchName || fireBranch.name) : emp.nextWeekBranch
          const employeeName = `${emp.firstName} ${emp.surname}`

          const shiftType = emp.nextWeekShift || "AM"
          allAssignments.push({
            employeeId,
            employeeName,
            branchId,
            branchName,
            shift: shiftType,
            isManual: false,
            ...getShiftTimes(shiftType),
          })
        }
      }

      // Add manual assignments (override any rotation assignment for the same employee)
      for (const [employeeIdStr, branchName] of Object.entries(manualAssignments)) {
        const branch = fireBranches.find((b) => b.branchName === branchName)
        const employee = fireEmployees.find((e) => String(e.id) === employeeIdStr) || crews.find((c) => String(c.id) === employeeIdStr)

        if (employee && branch) {
          const employeeName = `${employee.firstName} ${employee.surname}`

          // Remove any existing assignment for this employee (manual overrides rotation)
          const existingIdx = allAssignments.findIndex(
            (a) => String(a.employeeId) === String(employee.id),
          )
          if (existingIdx !== -1) {
            allAssignments.splice(existingIdx, 1)
          }

          allAssignments.push({
            employeeId: String(employee.id),
            employeeName,
            branchId: String(branch.id),
            branchName: branch.branchName || branch.name,
            shift: "AM",
            isManual: true,
            ...getShiftTimes("AM"),
          })

          // Save as manual override in separate collection
          try {
            const dayOfWeek = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })
            await saveManualOverride({
              employeeId: String(employee.id),
              employeeName,
              date: selectedDate,
              dayOfWeek,
              overrideBranchId: String(branch.id),
              overrideBranchName: branch.branchName || branch.name,
              shift: "AM",
              reason: "Manual override for schedule",
            })
          } catch (err) {
            console.error("Error saving manual override:", err)
          }
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
                setAppliedRotation(nextWeekRotationPreview)
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Restaurant Crew Scheduling</h1>
        <p className="text-muted-foreground">
          Manage crew schedules and automated rotations across restaurant branches
        </p>
      </div>

      <Tabs defaultValue="automated" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="automated">Automated Rotation</TabsTrigger>
          <TabsTrigger value="manual">Manual Assignment</TabsTrigger>
        </TabsList>

        <TabsContent value="automated" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Weekly Restaurant Crew Rotation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Automated rotation ensures fair distribution of crew members across the configured restaurant locations and
                prevents staff from staying at the same branch consecutive weeks
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">Next Rotation:</span>
                  <Badge variant="outline">{nextMondayDate}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">Total Crew Members:</span>
                  <Badge variant="outline">{(fireEmployees && fireEmployees.length > 0) ? fireEmployees.length : crews.length}</Badge>
                </div>
              </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      // Show Yes/No confirmation before generating
                      setShowRegenerateConfirm(true)
                    }}
                    disabled={branchesList.length === 0 || !hasAnyEmployees}
                  >
                    Generate New Rotation
                  </Button>
                </div>

                {undoAvailable && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="text-sm text-amber-600">Rotation applied — you can undo the last change.</div>
                    <Button variant="ghost" size="sm" onClick={() => undoRegenerate()}>
                      Undo
                    </Button>
                  </div>
                )}

                {rotatedEmployees && rotatedEmployees.length > 0 && (
                  <div className="mt-3 text-sm text-amber-600">
                    Preview active — changes are not applied. Open Preview and click "Apply Rotation" to persist.
                  </div>
                )}

              {(branchesList.length === 0 || !hasAnyEmployees) && (
                <div className="mt-2 text-sm text-amber-600">
                  {branchesList.length === 0
                    ? "No branches configured. Add branches in Branch Management to use automated rotation."
                    : "No crew members available. Add or enable crew members to use automated rotation."}
                </div>
              )}
            </CardContent>
          </Card>



          <Card>
            <CardHeader>
              <CardTitle>
                Current Schedules (
                {appliedScheduleWeek && appliedScheduleWeek.weekStart && appliedScheduleWeek.weekEnd ? (
                  `${new Date(appliedScheduleWeek.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(appliedScheduleWeek.weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                ) : (
                  currentWeekDates
                )}
                )
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Applied rotation preview for current week
              </p>
            </CardHeader>
            <CardContent>
              {appliedRotation && appliedRotation.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {branchesList.map((branch) => {
                    const crewForBranch = appliedRotation.filter((emp) => emp.nextWeekBranch === branch.name)
                    const amShift = crewForBranch.filter((emp) => emp.nextWeekShift === "AM")
                    const pmShift = crewForBranch.filter((emp) => emp.nextWeekShift === "PM")

                    return (
                      <Card key={branch.id} className="border-2">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">{branch.name}</CardTitle>
                          <Badge variant="secondary" className="w-fit">
                            {crewForBranch.length} crew members
                          </Badge>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {amShift.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                                <Clock className="h-3 w-3" />
                                AM Shift (7am - 2pm)
                              </div>
                              <div className="space-y-2">
                                {amShift.map((employee) => {
                                  const override = weeklyOverrides.find(
                                    (o) => String(o.employeeId) === String(employee.id) && o.date === todayISO
                                  )
                                  
                                  return (
                                    <div key={employee.id} className={`p-3 border rounded-lg ${override ? "bg-purple-100 border-purple-400" : "bg-blue-50/50"}`}>
                                      {override && (
                                        <div className="flex items-center gap-1 mb-1">
                                          <AlertTriangle className="h-3 w-3 text-purple-600" />
                                          <span className="text-xs font-semibold text-purple-600">Manual Override</span>
                                        </div>
                                      )}
                                      <div className="font-medium text-sm">
                                        {employee.firstName} {employee.surname}
                                      </div>
                                      {override ? (
                                        <div className="text-xs text-purple-700 mt-1">Override: {override.overrideBranchName}</div>
                                      ) : (
                                        <div className="text-xs text-muted-foreground mt-1">Assigned: {branch.name}</div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {pmShift.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                                <Clock className="h-3 w-3" />
                                PM Shift (2pm - 10pm)
                              </div>
                              <div className="space-y-2">
                                {pmShift.map((employee) => {
                                  const override = weeklyOverrides.find(
                                    (o) => String(o.employeeId) === String(employee.id) && o.date === todayISO
                                  )
                                  
                                  return (
                                    <div key={employee.id} className={`p-3 border rounded-lg ${override ? "bg-purple-100 border-purple-400" : "bg-orange-50/50"}`}>
                                      {override && (
                                        <div className="flex items-center gap-1 mb-1">
                                          <AlertTriangle className="h-3 w-3 text-purple-600" />
                                          <span className="text-xs font-semibold text-purple-600">Manual Override</span>
                                        </div>
                                      )}
                                      <div className="font-medium text-sm">
                                        {employee.firstName} {employee.surname}
                                      </div>
                                      {override ? (
                                        <div className="text-xs text-purple-700 mt-1">Override: {override.overrideBranchName}</div>
                                      ) : (
                                        <div className="text-xs text-muted-foreground mt-1">Assigned: {branch.name}</div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {amShift.length === 0 && pmShift.length === 0 && crewForBranch.length > 0 && (
                            <div className="space-y-2">
                              {crewForBranch.map((employee) => {
                                const override = weeklyOverrides.find(
                                  (o) => String(o.employeeId) === String(employee.id) && o.date === todayISO
                                )
                                
                                return (
                                  <div key={employee.id} className={`p-3 border rounded-lg ${override ? "bg-purple-100 border-purple-400" : "bg-card"}`}>
                                    {override && (
                                      <div className="flex items-center gap-1 mb-1">
                                        <AlertTriangle className="h-3 w-3 text-purple-600" />
                                        <span className="text-xs font-semibold text-purple-600">Manual Override</span>
                                      </div>
                                    )}
                                    <div className="font-medium text-sm">
                                      {employee.firstName} {employee.surname}
                                    </div>
                                    {override ? (
                                      <div className="text-xs text-purple-700 mt-1">Override: {override.overrideBranchName}</div>
                                    ) : (
                                      <div className="text-xs text-muted-foreground mt-1">Assigned: {branch.name}</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {crewForBranch.length === 0 && (
                            <div className="text-center py-4 text-sm text-muted-foreground">No crew assigned</div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No rotation applied yet. Generate and apply a rotation to see it here.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Schedule Details by Day
              </CardTitle>
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
                      // Use actual attendance records if available, fall back to override logic
                      const dayAttendance = weekAttendance[dateISO]
                      const dateOverrides = weeklyOverrides.filter((o: any) => o.date === dateISO)
                      const uniqueAbsentIds = new Set<string>()
                      // Count absences: check attendance records first, then overrides
                      if (dayAttendance && Object.keys(dayAttendance).length > 0) {
                        // We have attendance data for this day — count those NOT present
                        assignments.forEach((ba: any) => {
                          (ba.employees || []).forEach((emp: any) => {
                            const status = dayAttendance[String(emp.employeeId)]
                            if (status && status !== "present") {
                              uniqueAbsentIds.add(String(emp.employeeId))
                            } else if (!status) {
                              // No attendance record — check overrides
                              const hasOverride = dateOverrides.find((o: any) => String(o.employeeId) === String(emp.employeeId))
                              if (hasOverride) uniqueAbsentIds.add(String(emp.employeeId))
                            }
                          })
                        })
                      } else {
                        // No attendance data — use overrides only (future days)
                        dateOverrides.forEach((o: any) => uniqueAbsentIds.add(String(o.employeeId)))
                      }
                      const absentCount = uniqueAbsentIds.size
                      // Count present employees for the header
                      const presentIds = new Set<string>()
                      if (dayAttendance && Object.keys(dayAttendance).length > 0) {
                        assignments.forEach((ba: any) => {
                          (ba.employees || []).forEach((emp: any) => {
                            if (dayAttendance[String(emp.employeeId)] === "present") presentIds.add(String(emp.employeeId))
                          })
                        })
                      }
                      const presentCount = presentIds.size
                      const isToday = dateISO === formatDateLocal(new Date())
                      
                      details.push(
                        <div key={i} className={`border rounded-lg ${isToday ? 'ring-2 ring-blue-400 bg-blue-50/30' : ''}`}>
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedDays)
                              if (newExpanded.has(i)) {
                                newExpanded.delete(i)
                              } else {
                                newExpanded.add(i)
                              }
                              setExpandedDays(newExpanded)
                            }}
                            className="w-full flex items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 flex-1 text-left">
                              <div className="text-sm font-medium">{dayName}, {dateStr} {isToday ? '(Today)' : ''}</div>
                              <div className="text-xs text-muted-foreground">({totalCrew} crew{presentCount > 0 ? `, ${presentCount} present` : ''}{absentCount > 0 ? `, ${absentCount} absent` : ""})</div>
                            </div>
                            <div className="text-xs text-muted-foreground">{isExpanded ? "▼" : "▶"}</div>
                          </button>
                          
                          {isExpanded && (
                            <div className="border-t p-3 space-y-3 bg-muted/20">
                              {assignments.map((branchAssignment: any) => (
                                <div key={branchAssignment.branchName}>
                                  <div className="text-xs font-medium text-muted-foreground mb-1.5">{branchAssignment.branchName}</div>
                                  <div className="space-y-1">
                                    {(branchAssignment.employees || []).map((employee: any) => {
                                      const override = weeklyOverrides.find(
                                        (o: any) => String(o.employeeId) === String(employee.employeeId) && o.date === dateISO
                                      )
                                      const dayAtt = weekAttendance[dateISO]
                                      const attStatus = dayAtt?.[String(employee.employeeId)]
                                      
                                      // Determine display status: attendance record takes priority over overrides
                                      let status: string
                                      let statusColor: string
                                      if (attStatus === "present") {
                                        status = "Present"
                                        statusColor = "text-green-600"
                                      } else if (attStatus === "absent") {
                                        status = "Absent"
                                        statusColor = "text-red-600"
                                      } else if (override) {
                                        status = "Absent"
                                        statusColor = "text-amber-600"
                                      } else {
                                        // No attendance record and no override
                                        const dateObj = new Date(dateISO + "T00:00:00")
                                        const todayObj = new Date()
                                        todayObj.setHours(0,0,0,0)
                                        if (dateObj < todayObj) {
                                          // Past day — no clock-in record
                                          status = "No Record"
                                          statusColor = "text-gray-500"
                                        } else if (dateObj.getTime() === todayObj.getTime() && dayAtt && Object.keys(dayAtt).length > 0) {
                                          // Today and we have some attendance data but this employee didn't clock in
                                          status = "Not Clocked In"
                                          statusColor = "text-amber-600"
                                        } else {
                                          status = "Scheduled"
                                          statusColor = "text-blue-600"
                                        }
                                      }
                                      const displayBranch = override ? override.overrideBranchName : branchAssignment.branchName
                                      
                                      return (
                                        <div key={employee.employeeId} className="flex items-center justify-between text-xs p-1.5 rounded bg-background border">
                                          <div className="flex-1">
                                            <div className="font-medium">{employee.employeeName}</div>
                                            <div className="text-muted-foreground">{employee.shift || "AM"} Shift</div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`font-medium ${statusColor}`}>
                                              {status}
                                            </div>
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
                  No schedules saved yet. Generate and apply a rotation to see schedules here.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Next Week's Rotation ({nextWeekDates})
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Preview of the predicted rotation for next week — updates automatically when the week changes
              </p>
            </CardHeader>
            <CardContent>
              {nextWeekRotationPreview && nextWeekRotationPreview.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {branchesList.map((branch) => {
                    const crewForBranch = nextWeekRotationPreview.filter((emp) => emp.nextWeekBranch === branch.name)
                    const amShift = crewForBranch.filter((emp) => emp.nextWeekShift === "AM")
                    const pmShift = crewForBranch.filter((emp) => emp.nextWeekShift === "PM")

                    // Only render if there's crew assigned
                    if (crewForBranch.length === 0) return null

                    return (
                      <Card key={branch.id} className="border">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{branch.name}</CardTitle>
                          <Badge variant="secondary" className="w-fit text-xs">
                            {crewForBranch.length} crew
                          </Badge>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          {amShift.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                                <Clock className="h-3 w-3" />
                                AM
                              </div>
                              <div className="space-y-1">
                                {amShift.map((employee) => (
                                  <div key={employee.id} className="p-2 border rounded bg-blue-50/50 text-xs">
                                    <div className="font-medium">
                                      {employee.firstName} {employee.surname}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {pmShift.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                                <Clock className="h-3 w-3" />
                                PM
                              </div>
                              <div className="space-y-1">
                                {pmShift.map((employee) => (
                                  <div key={employee.id} className="p-2 border rounded bg-orange-50/50 text-xs">
                                    <div className="font-medium">
                                      {employee.firstName} {employee.surname}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No preview available yet. Click "Generate New Rotation" to generate.
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={showRotationPreview} onOpenChange={setShowRotationPreview}>
            <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Next Week's Rotation Preview ({nextWeekDates})</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Review crew assignments by branch and make manual adjustments before applying the rotation
                </p>
              </DialogHeader>

              {(!rotatedEmployees || rotatedEmployees.length === 0) && (
                <div className="px-6 pb-4 text-sm text-amber-600">
                  No preview available. Regenerate rotation will update current schedules — previews are not generated in this mode.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-4">
                {branchesList.map((branch) => {
                  const crewForBranch = rotatedEmployees.filter((emp) => emp.nextWeekBranch === branch.name)
                  const amShift = crewForBranch.filter((emp) => emp.nextWeekShift === "AM")
                  const pmShift = crewForBranch.filter((emp) => emp.nextWeekShift === "PM")

                  return (
                    <Card key={branch.id} className="border-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">{branch.name}</CardTitle>
                        <Badge variant="secondary" className="w-fit">
                          {crewForBranch.length} crew members
                        </Badge>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {amShift.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                              <Clock className="h-3 w-3" />
                              AM Shift (7am - 2pm)
                            </div>
                            <div className="space-y-2">
                              {amShift.map((employee) => (
                                <div key={employee.id} className="p-3 border rounded-lg bg-blue-50/50">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium text-sm">
                                      {employee.firstName} {employee.surname}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingEmployee(employee.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                  </div>

                                  {String(editingEmployee) === String(employee.id) && (
                                    <div className="mt-2">
                                      <Select
                                        value={employee.nextWeekBranch}
                                        onValueChange={(value) => {
                                          handleManualAssignment(employee.id, value)
                                          setEditingEmployee(null)
                                        }}
                                      >
                                        <SelectTrigger className="h-8">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {branchesList.map((b) => (
                                            <SelectItem key={b.id} value={b.name}>
                                              {b.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}

                                  <div className="text-xs text-muted-foreground mt-1">
                                    From: {employee.currentBranch}
                                  </div>

                                      {manualAssignments[String(employee.id)] ? (
                                        <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                          <AlertTriangle className="h-3 w-3" />
                                          Manual Override
                                        </div>
                                      ) : pendingAssignments[String(employee.id)] ? (
                                        <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                          <AlertTriangle className="h-3 w-3" />
                                          Pending
                                        </div>
                                      ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {pmShift.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                              <Clock className="h-3 w-3" />
                              PM Shift (2pm - 10pm)
                            </div>
                            <div className="space-y-2">
                              {pmShift.map((employee) => (
                                <div key={employee.id} className="p-3 border rounded-lg bg-orange-50/50">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium text-sm">
                                      {employee.firstName} {employee.surname}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingEmployee(employee.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                  </div>

                                  {String(editingEmployee) === String(employee.id) && (
                                    <div className="mt-2">
                                      <Select
                                        value={employee.nextWeekBranch}
                                        onValueChange={(value) => {
                                          handleManualAssignment(employee.id, value)
                                          setEditingEmployee(null)
                                        }}
                                      >
                                        <SelectTrigger className="h-8">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {branchesList.map((b) => (
                                            <SelectItem key={b.id} value={b.name}>
                                              {b.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}

                                  <div className="text-xs text-muted-foreground mt-1">
                                    From: {employee.currentBranch}
                                  </div>

                                  {manualAssignments[String(employee.id)] ? (
                                    <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Manual Override
                                    </div>
                                  ) : pendingAssignments[String(employee.id)] ? (
                                    <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Pending
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {crewForBranch.length === 0 && (
                          <div className="text-center py-4 text-sm text-muted-foreground">No crew assigned</div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowRotationPreview(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={branchesList.length === 0 || !hasAnyEmployees}
                  onClick={async () => {
                    if (branchesList.length === 0 || !hasAnyEmployees) {
                      showNotification(
                        "error",
                        "Cannot Apply Rotation",
                        branchesList.length === 0
                          ? "No branches configured. Add branches in Branch Management."
                          : "No crew members available. Add or enable crew members first.",
                      )
                      return
                    }

                    if (!rotatedEmployees || rotatedEmployees.length === 0) {
                      showNotification("info", "No Preview", "No rotation preview available. Click Regenerate to create a preview first.")
                      return
                    }

                    // Compute current week's Monday and Sunday for applying the preview rotation to current week
                    const today = new Date()
                    const currentDay = today.getDay()
                    const currentMonday = new Date(today)
                    currentMonday.setDate(today.getDate() - currentDay + (currentDay === 0 ? -6 : 1))
                    
                    const currentMondayISO = formatDateLocal(currentMonday)
                    const currentSundayISO = (() => { const s = new Date(currentMonday); s.setDate(currentMonday.getDate() + 6); return formatDateLocal(s) })()

                    // Build assignments for current week's schedule
                    const applyRotationAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string; shiftStart?: string; shiftEnd?: string; isManual?: boolean }> = []

                    for (const emp of rotatedEmployees) {
                      // Search in fireBranches first (same source the rotation algo used), then fall back to store branches
                      const targetBranch = fireBranches.find((b: any) => b.branchName === emp.nextWeekBranch || b.name === emp.nextWeekBranch)
                        || branches.find((b: any) => b.branchName === emp.nextWeekBranch)
                      if (targetBranch) {
                        const employeeName = `${emp.firstName} ${emp.surname}`
                        const branchName = targetBranch.branchName || targetBranch.name
                        const shiftType = emp.nextWeekShift || "AM"
                        applyRotationAssignments.push({
                          employeeId: String(emp.id),
                          employeeName,
                          branchId: String(targetBranch.id),
                          branchName,
                          shift: shiftType,
                          isManual: !!emp.isManual,
                          ...getShiftTimes(shiftType),
                        })
                        // Also update current assignment so the applied preview becomes the current rotation
                        if (emp.storeCrewId) assignCrewToBranch(emp.storeCrewId, targetBranch.id)
                      } else {
                        console.warn("[Apply Rotation Button] No matching branch found for:", emp.nextWeekBranch)
                      }
                    }
                    // Save as 7 schedule documents for current week (one per day, Mon-Sun)
                    if (applyRotationAssignments.length > 0) {
                      const startTime = "07:00"
                      try {
                        // Delete any existing non-manual schedules for current week
                        try {
                          await deleteSchedulesForWeek(currentMondayISO, true)
                        } catch (err) {
                          console.warn("[Apply Rotation] Could not delete existing schedules:", err)
                        }

                        // Batch-fetch remaining manual dates (1 call instead of 7)
                        const manualDates = new Set<string>()
                        try {
                          const weekScheds = await getSchedulesForWeekFromFirestore(currentMondayISO)
                          for (const s of weekScheds) {
                            if (s.manuallyScheduled && s.scheduleFor) manualDates.add(s.scheduleFor)
                          }
                        } catch {}

                        // Build assignment payload once
                        const assignmentPayload = applyRotationAssignments.map((a) => ({
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

                        // Save in parallel, skip manually scheduled dates
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
                          const branchNames = [...new Set(applyRotationAssignments.map(a => a.branchName))].join(", ")
                          showNotification("success", "Schedule Saved", `Applied rotation saved for ${savedDates.length} days (${savedDates[0]} - ${savedDates[savedDates.length - 1]}) for branches: ${branchNames}`)
                          await sendScheduleNotifications(applyRotationAssignments, `${savedDates[0]} - ${savedDates[savedDates.length - 1]}`)

                          // Sync employee branchId in users table so Dashboard reflects the new branch
                          await syncEmployeeBranches(applyRotationAssignments)
                        } else {
                          showNotification("error", "Save Error", "Failed to save rotation to Firestore")
                        }
                      } catch (err) {
                        console.error("[Apply Rotation] Failed to save schedules:", err)
                        showNotification("error", "Save Error", "Failed to save rotation to Firestore")
                      }
                    }

                    // Refresh employee data so the UI reflects updated branches
                    await fetchFireData()

                    // Clear preview/manual overrides after applying so Preview is reset
                    setRotatedEmployees([])
                    setManualAssignments({})
                    
                    // Store the applied rotation to display in Current Schedules card
                    setAppliedRotation(rotatedEmployees)

                    // Refresh the week schedules display
                    await fetchWeekSchedulesFromFirestore()

                    showNotification("success", "Rotation Applied", "Next week's rotation has been scheduled and set as the current rotation.")
                    setShowRotationPreview(false)
                  }}
                >
                  Apply Rotation
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Yes/No Confirmation Dialog for Generate New Rotation */}
          <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Generate New Rotation?</DialogTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  This will generate a new crew rotation for the current week. Manually scheduled days will be preserved.
                  {Object.keys(manualAssignments).length > 0 && (
                    <span className="block mt-1 text-amber-600">
                      {Object.keys(manualAssignments).length} manual assignment(s) will be respected in the rotation.
                    </span>
                  )}
                </p>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>
                  No, Cancel
                </Button>
                <Button onClick={confirmRegenerate}>
                  Yes, Generate
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="manual" className="space-y-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search crew members..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <Card className="lg:w-1/3">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Available Restaurant Crew</CardTitle>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      setManualAssignments((prev) => {
                        const updated = { ...prev }
                        // For each pending assignment, evict any other employee occupying that branch
                        for (const [newEmpId, newBranch] of Object.entries(pendingAssignments)) {
                          for (const [existingId, existingBranch] of Object.entries(updated)) {
                            if (existingBranch === newBranch && existingId !== newEmpId) {
                              delete updated[existingId]
                            }
                          }
                          updated[newEmpId] = newBranch
                        }
                        return updated
                      })
                      setPendingAssignments({})
                      showNotification("success", "Selections Saved", "Pending selections have been confirmed and will show on branch cards.")
                    }}
                  >
                    Confirm Selections
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const displayCrews = (fireEmployees && fireEmployees.length > 0) ? fireEmployees : crews
                  const filtered = displayCrews.filter((crew: any) => {
                    const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
                    return fullName.includes(searchQuery.toLowerCase())
                  })

                  return filtered.length > 0 ? (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                      {filtered.map((crew: any) => {
                        // try to find matching store crew for assignment actions (for backward compatibility with assignCrewToBranch)
                        const matchedStore = crews.find((sc) => {
                          if (crew.email && sc.email) return (crew.email || "").toLowerCase() === (sc.email || "").toLowerCase()
                          return sc.firstName === crew.firstName && sc.surname === crew.surname
                        })

                        return (
                          <div key={crew.id} className="p-4 rounded-lg border bg-card">
                            <div className="mb-2">
                              <div className="font-medium">
                                {crew.firstName} {crew.surname}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Select onValueChange={(value) => {
                                // Store as pending assignment (branch name) until user confirms
                                const branchName = value === "unassigned" ? "Unassigned" : (fireBranches.find((b) => String(b.id) === value)?.branchName || value)
                                handleManualAssignment(crew.id, branchName)
                              }}>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select Branch" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {fireBranches.map((branch) => (
                                    <SelectItem key={branch.id} value={branch.id.toString()}>
                                      {branch.branchName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "No crew members match your search" : "No active crew members available"}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>

            <div className="lg:w-2/3 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="w-full">
                  <Label className="text-sm font-medium mb-2 block">View Scheduled Employees</Label>
                  <Select value={selectedBranchForDisplay || "all"} onValueChange={(value) => {
                    setSelectedBranchForDisplay(value === "all" ? null : value)
                    // Scroll the grid into view when a branch is selected - with delay for DOM update
                    setTimeout(() => {
                      const gridElement = document.querySelector('[data-branch-grid]')
                      if (gridElement) {
                        gridElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    }, 100)
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a branch to view scheduled employees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {fireBranches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id.toString()}>
                          {branch.branchName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full sm:w-48"
                />
                <Button onClick={handleSaveSchedule}>Save Schedule</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-branch-grid>
                {(() => {
                  if (!selectedBranchForDisplay) {
                    // Show all branches with their assigned employees
                    return fireBranches.length > 0 ? (
                      fireBranches.map((branch) => {
                        // Prefer Firestore employees for the branch
                        const assignedCrews = fireEmployees.length > 0
                          ? getFirestoreEmployeesForBranch(branch.id)
                          : getCrewsForBranch(branch.id)
                        return (
                          <Card key={branch.id}>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg">{branch.branchName}</CardTitle>
                              <p className="text-sm text-muted-foreground">{branch.address}</p>
                            </CardHeader>
                            <CardContent>
                              {assignedCrews.length > 0 ? (
                                <div className="space-y-2">
                                  {assignedCrews.map((crew) => (
                                    <div key={crew.id} className="p-2 rounded-md text-sm bg-muted">
                                      {crew.firstName} {crew.surname}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-sm text-muted-foreground">No employees assigned</div>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })
                    ) : (
                      <div className="col-span-2 text-center py-8 text-muted-foreground">
                        No branches available. Add branches in the Branch Management section.
                      </div>
                    )
                  } else {
                    // Show specific branch with its employees
                    const selectedBranch = fireBranches.find((b) => String(b.id) === selectedBranchForDisplay)
                    if (!selectedBranch) return <div className="text-center py-8 text-muted-foreground">Branch not found</div>
                    
                    // Prefer Firestore employees for the selected branch
                    const assignedCrews = fireEmployees.length > 0 
                      ? getFirestoreEmployeesForBranch(selectedBranch.id)
                      : getCrewsForBranch(selectedBranch.id)
                    
                    return (
                      <Card className="col-span-1 md:col-span-2 border-2 border-blue-500 bg-blue-50 dark:bg-blue-950 animate-in fade-in slide-in-from-top-2 duration-300">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle>{selectedBranch.branchName}</CardTitle>
                              <p className="text-sm text-muted-foreground">{selectedBranch.address}</p>
                              <p className="text-sm font-medium mt-2">{assignedCrews.length} employees scheduled</p>
                            </div>
                            <div className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full">Selected</div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {assignedCrews.length > 0 ? (
                            <div className="space-y-3">
                              {assignedCrews.map((crew) => (
                                <div key={crew.id} className="p-3 rounded-lg border bg-card">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <div className="font-medium">{crew.firstName} {crew.surname}</div>
                                      <div className="text-xs text-muted-foreground mt-1">{crew.type || "Employee"}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">No employees scheduled for this branch</div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  }
                })()}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>


    </div>
  )
}

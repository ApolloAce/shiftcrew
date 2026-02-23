"use client"

import { useState, useEffect } from "react"
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
import { addSchedule as addScheduleToFirestore, getSchedulesForDate as getSchedulesForDateFromFirestore, deleteSchedulesForWeek } from "@/lib/firestore-schedule-service"
import { saveManualOverride, getOverridesForWeek } from "@/lib/firestore-manual-override-service"
import { Search, RotateCcw, Edit, Calendar, Users, AlertTriangle, Clock } from "lucide-react"

// Helper: safely convert a shift value (string or {start,end} object) to a display string
function formatShift(shift: any): string {
  if (!shift) return "AM"
  if (typeof shift === "string") return shift
  if (typeof shift === "object" && shift.start) {
    return `${shift.start}${shift.end ? " - " + shift.end : ""}`
  }
  return "AM"
}

// Scheduling now uses live store data. No local sampleEmployees are present so the app starts empty.
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

  // derive a lightweight list of branches for the rotation algorithm — prefer Firestore branches if available, otherwise fall back to store branches
  const branchesList = (fireBranches.length > 0
    ? fireBranches.map((b: any) => ({ id: b.id, name: b.branchName || b.name, address: b.address }))
    : (branches || []).map((b: any) => ({ id: b.id, name: b.branchName, address: b.address })))

  // whether at least one crew has been assigned to a branch (used to require initial manual seeding)
  // Use store crews when available, otherwise use API-sourced employees
  const crews = storeCrews.length > 0 ? storeCrews : fireEmployees
  const hasInitialAssignments = crews.some((c) => (getAssignedBranch ? getAssignedBranch(c.id) : null) || c.branchId)

  // Helper function to get Firestore employees for a specific branch
  // Includes both employees with branchId set AND manually assigned employees
  const getFirestoreEmployeesForBranch = (branchId: string | number) => {
    const branch = fireBranches.find((b) => String(b.id) === String(branchId))
    const branchName = branch?.branchName

    // Get employees with branchId matching (from Firestore)
    const firestoreMatches = fireEmployees.filter((emp: any) => String(emp.branchId) === String(branchId))

    // Get manually assigned employees for this branch
    const manuallyAssigned = fireEmployees.filter((emp: any) => {
      const assignedBranchName = manualAssignments[String(emp.id)]
      return assignedBranchName === branchName
    })

    // Combine and deduplicate by employee ID
    const combined = [...firestoreMatches]
    for (const emp of manuallyAssigned) {
      if (!combined.find((e) => String(e.id) === String(emp.id))) {
        combined.push(emp)
      }
    }

    return combined
  }

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
  const [appliedRotation, setAppliedRotation] = useState<any[]>([])
  const [nextWeekRotationPreview, setNextWeekRotationPreview] = useState<any[]>([])

  const [showRotationPreview, setShowRotationPreview] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [lastAssignmentSnapshot, setLastAssignmentSnapshot] = useState<Array<{ crewId: number; prevBranchId: number | null }>>([])
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<number | string | null>(null)
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({})
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string>>({})
  const [weeklyOverrides, setWeeklyOverrides] = useState<any[]>([])
  const [weekAttendance, setWeekAttendance] = useState<Record<string, any[]>>({})
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0]))
  const [weekSchedules, setWeekSchedules] = useState<Record<string, any>>({})

  const generateRotation = (opts?: { avoidSameBranch?: boolean }) => {
    // Prefer Firestore employees for preview/rotation when available; fall back to store crews
    const sourceEmployees = (fireEmployees && fireEmployees.length > 0) ? fireEmployees : crews

    // Build a lightweight employee view; try to preserve a link to the in-store crew id when possible
    const lightweight = sourceEmployees.map((c: any, idx: number) => {
      // find matching store crew by email or name to get assigned branch and numeric id for assignments
      const matchedStoreCrew = storeCrews.find((sc) => {
        if (c.email && sc.email) return (c.email || "").toLowerCase() === (sc.email || "").toLowerCase()
        return (sc.firstName === c.firstName && sc.surname === c.surname)
      })

      const assignedBranch = matchedStoreCrew && getAssignedBranch ? getAssignedBranch(matchedStoreCrew.id) : null
      // Fall back to looking up branchId from the API-loaded branches
      let currentBranchName = "Unassigned"
      if (assignedBranch) {
        currentBranchName = assignedBranch.branchName
      } else if (c.branchId) {
        const apiBranch = fireBranches.find((b: any) => String(b.id) === String(c.branchId))
        currentBranchName = apiBranch ? (apiBranch.branchName || apiBranch.name) : "Unassigned"
      }
      // Always use the source employee's own ID as the canonical key so it matches
      // manualAssignments keys (which are Firestore string IDs). Keep the store crew
      // ID as a secondary reference for backward-compatible assignCrewToBranch calls.
      const canonicalId = c.id ?? `fire-${idx}`
      const storeCrewId = matchedStoreCrew ? matchedStoreCrew.id : null

      return {
        id: canonicalId,
        storeCrewId,
        firstName: c.firstName,
        surname: c.surname,
        email: c.email,
        currentBranch: currentBranchName,
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
    const manualAssignedIds = Object.keys(manualAssignments).map((k) => String(k))
    const manualCount: Record<string, number> = {}
    for (const idStr of Object.keys(manualAssignments)) {
      const bn = manualAssignments[idStr]
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

    // First, apply manual assignments (always honor)
    for (const idStr of Object.keys(manualAssignments)) {
      const id = idStr
      const emp = lightweight.find((e) => String(e.id) === String(id))
      const branchName = manualAssignments[idStr]
      if (emp && branchName) {
        assignedResults.push({ ...emp, nextWeekBranch: branchName, nextWeekShift: emp.shift || "AM" })
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
  const [initialDataLoaded, setInitialDataLoaded] = useState(false)

  // Clear any existing preview when the underlying store data changes (so a stale preview
  // isn't shown after branches/crews are edited). Do NOT regenerate automatically.
  // Skip the initial load (when fireEmployees arrives async) to avoid wiping out state.
  useEffect(() => {
    if (!initialDataLoaded) {
      // Mark as loaded once we have both crews and branches
      if (crews.length > 0 && branchesList.length > 0) {
        setInitialDataLoaded(true)
      }
      return
    }
    // Only clear on subsequent changes (actual edits to branches/crews)
    setRotatedEmployees([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crews.length, branchesList.length])

  // Fetch Firestore branches and employees for scheduling persistence and UI
  useEffect(() => {
    const fetchFireData = async () => {
      try {
        const [b, e] = await Promise.all([getBranchesFromFirestore(), getEmployeesFromFirestore()])
        setFireBranches(b)
        setFireEmployees(e)
        console.log("Firestore branches/employees loaded:", b.length, e.length)

        // NOTE: Do NOT pre-populate manualAssignments from employees' persisted branchId.
        // That would lock every employee to their current branch during rotation.
        // The employee's currentBranch is already determined inside generateRotation()
        // via the branchId lookup, which feeds the avoidSameBranch logic.
        // manualAssignments should only contain user-initiated manual overrides from the UI.
      } catch (err) {
        console.error("Error loading Firestore scheduling data:", err)
      }
    }

    fetchFireData()
  }, [])

  // Fetch current week's manual overrides
  const fetchWeeklyOverrides = async () => {
    try {
      const today = formatDateLocal(new Date())
      const overrides = await getOverridesForWeek(today)
      setWeeklyOverrides(overrides)
      console.log("Weekly overrides loaded:", overrides.length)
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
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const startDate = formatDateLocal(monday)
      const endDate = formatDateLocal(sunday)

      const res = await fetch(`/api/attendance?startDate=${startDate}&endDate=${endDate}`)
      if (!res.ok) return
      const records: any[] = await res.json()

      // Group by date
      const byDate: Record<string, any[]> = {}
      for (const rec of records) {
        const d = rec.date?.split("T")[0] || rec.date
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(rec)
      }
      setWeekAttendance(byDate)
      console.log("[Attendance] Loaded", records.length, "records for week", startDate, "-", endDate)
    } catch (err) {
      console.error("Error fetching week attendance:", err)
    }
  }

  useEffect(() => {
    fetchWeeklyOverrides()
    fetchWeekSchedulesFromFirestore()
    fetchWeekAttendance()
  }, [])

  // Fetch current week's schedule and load it into appliedRotation
  const fetchCurrentWeekSchedule = async () => {
    try {
      const todayDate = new Date()
      const day = todayDate.getDay()
      const monday = new Date(todayDate)
      monday.setDate(todayDate.getDate() - day + (day === 0 ? -6 : 1))
      const mondayISO = formatDateLocal(monday)

      // Single query by weekStart instead of 7 per-day queries
      const res = await fetch(`/api/schedules?weekStart=${mondayISO}`)
      if (!res.ok) {
        console.warn("[Fetch Schedules] API returned", res.status)
        return
      }

      const allSchedules = await res.json()
      console.log("[Fetch Schedules] weekStart query for", mondayISO, "found", allSchedules?.length || 0, "documents")

      if (!Array.isArray(allSchedules) || allSchedules.length === 0) {
        console.log("[Fetch Schedules] No schedules found for current week")
        return
      }

      // Pick the latest schedule (by updatedAt) to extract rotation data
      const latestSchedule = allSchedules.sort((a: any, b: any) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime()
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime()
        return dateB - dateA
      })[0]

      console.log("[Fetch Schedules] Latest schedule:", { date: latestSchedule.date, scheduleFor: latestSchedule.scheduleFor, weekStart: latestSchedule.weekStart, weekEnd: latestSchedule.weekEnd })

      // Parse branchAssignments (could be string from DB)
      let branchAssignments = latestSchedule.branchAssignments
      if (typeof branchAssignments === "string") {
        try { branchAssignments = JSON.parse(branchAssignments) } catch { branchAssignments = null }
      }

      if (Array.isArray(branchAssignments) && branchAssignments.length > 0) {
        // Deduplicate employees by ID across branches (in case of overlapping data)
        const seenIds = new Set<string>()
        const rotationData: any[] = []
        for (const branchAssignment of branchAssignments) {
          for (const employee of (branchAssignment.employees || [])) {
            const empId = String(employee.employeeId)
            if (seenIds.has(empId)) continue
            seenIds.add(empId)
            rotationData.push({
              id: empId,
              firstName: employee.employeeName ? employee.employeeName.split(" ")[0] : "Unknown",
              surname: employee.employeeName ? employee.employeeName.split(" ").slice(1).join(" ") : "",
              nextWeekBranch: branchAssignment.branchName,
              nextWeekShift: formatShift(employee.shift),
            })
          }
        }
        setAppliedRotation(rotationData)

        const scheduleDate = latestSchedule.scheduleFor || latestSchedule.date
        const weekBounds = getWeekBoundsFromDate(scheduleDate)
        setAppliedScheduleWeek(weekBounds)
        console.log("[Fetch Schedules] Loaded", rotationData.length, "assignments for week", weekBounds.weekStart, "-", weekBounds.weekEnd)
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

      const schedulesByDate: Record<string, any> = {}

      // Fetch all schedules for this week by weekStart (single query)
      try {
        const res = await fetch(`/api/schedules?weekStart=${mondayISO}`)
        if (res.ok) {
          const allSchedules = await res.json()
          // Group by scheduleFor, keeping only the latest per day
          for (const sched of allSchedules) {
            const targetDate = sched.scheduleFor || sched.date
            const existing = schedulesByDate[targetDate]
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
                    shift: formatShift(assignment.shift)
                  })
                }
                sched.branchAssignments = Object.values(branchMap)
              }
              schedulesByDate[targetDate] = sched
            }
          }
        }
      } catch (e) {
        console.warn("Error fetching week schedules by weekStart:", e)
      }

      setWeekSchedules(schedulesByDate)
    } catch (err) {
      console.error("Error fetching week schedules:", err)
    }
  }

  useEffect(() => {
    fetchCurrentWeekSchedule()
  }, [])

  // Next week rotation preview is generated only when the user explicitly clicks
  // "Generate New Rotation" and confirms. No auto-generation.

  // Wrapped regenerate so we can show feedback and ensure UI updates
  const handleRegenerate = async () => {
    // Open confirmation modal instead of executing immediately
    setShowRegenerateConfirm(true)
  }

  const confirmRegenerate = async () => {
    try {
      console.log("[Regenerate] Starting regeneration process...")
      // Snapshot current assignments (crew -> branchId|null)
      const snapshot = crews.map((c) => {
        const assigned = getAssignedBranch ? getAssignedBranch(c.id) : null
        return { crewId: c.id, prevBranchId: assigned ? assigned.id : null }
      })
      setLastAssignmentSnapshot(snapshot)
      console.log("[Regenerate] Snapshot created:", snapshot.length, "crews")

      // Generate rotation and apply
      const next = generateRotation({ avoidSameBranch: true })
      console.log("[Regenerate] Rotation generated:", next?.length || 0, "employees")
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
      const regeneratedAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string }> = []

      console.log("[Regenerate] branchesList:", branchesList.length, "branches:", branchesList.map(b => b.name))

      for (const emp of next) {
        // Search in fireBranches first (same source the rotation algo used), then fall back to store branches
        const targetBranch = fireBranches.find((b: any) => b.branchName === emp.nextWeekBranch || b.name === emp.nextWeekBranch)
          || branches.find((b: any) => b.branchName === emp.nextWeekBranch)
        if (targetBranch) {
          // update in-memory store assignment (keeps other app logic working)
          // Use storeCrewId (numeric) if available since the Zustand store expects numeric IDs
          try {
            const storeId = emp.storeCrewId ?? emp.id
            assignCrewToBranch(storeId, targetBranch.id)
            console.log("[Regenerate] Assigned crew", storeId, "to branch", targetBranch.id)
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

          regeneratedAssignments.push({
            employeeId,
            employeeName,
            branchId,
            branchName,
            shift: emp.shift || "AM",
          })

          // Persist branchId to the database (users table)
          try {
            await fetch("/api/employees", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: employeeId, branchId }),
            })
            console.log("[Regenerate] Persisted branchId to DB:", employeeName, "->", branchName)
          } catch (err) {
            console.error("[Regenerate] Failed to persist branchId for", employeeName, err)
          }
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
          const currentSundayISO = (() => { const s = new Date(currentMonday); s.setDate(currentMonday.getDate() + 6); return formatDateLocal(s) })()

          // Delete any existing schedules for current week
          try {
            await deleteSchedulesForWeek(currentMondayISO)
          } catch (err) {
            console.warn("[Regenerate] Could not delete existing schedules for current week:", err)
          }

          // Save 7 schedule documents (one per day of the week)
          const savedDates: string[] = []
          for (let i = 0; i < 7; i++) {
            const d = new Date(currentMonday)
            d.setDate(currentMonday.getDate() + i)
            const dayISO = formatDateLocal(d)

            try {
              await addScheduleToFirestore({
                date: currentMondayISO, // Save date is Monday of the week
                scheduleFor: dayISO, // Specific date this schedule is for
                time: startTime,
                weekStart: currentMondayISO,
                weekEnd: currentSundayISO,
                assignments: regeneratedAssignments.map((a) => ({
                  employeeId: a.employeeId,
                  employeeName: a.employeeName,
                  branchId: a.branchId,
                  branchName: a.branchName,
                  isPresent: true,
                  shift: a.shift,
                })),
              })
              savedDates.push(dayISO)
            } catch (e) {
              console.warn("[Regenerate] Failed to save schedule for", dayISO, e)
            }
          }

          if (savedDates.length > 0) {
            const branchNames = [...new Set(regeneratedAssignments.map((a) => a.branchName))].join(", ")
            showNotification("success", "Schedule Saved", `Regenerated schedule saved for ${savedDates.length} days (${savedDates[0]} - ${savedDates[savedDates.length - 1]}) for branches: ${branchNames}`)
            console.log("[Regenerate] Saved schedules for dates:", savedDates)
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

      // Refresh both the week schedules display AND the appliedRotation from DB
      await fetchWeekSchedulesFromFirestore()
      await fetchCurrentWeekSchedule()

      // Generate a next-week preview so the "Next Week's Rotation" card is populated
      const nextWeekPreview = generateRotation({ avoidSameBranch: true })
      setNextWeekRotationPreview(nextWeekPreview)

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
    // Save to pending assignments first; user must confirm to commit
    setPendingAssignments((prev) => ({
      ...prev,
      [key]: branchName,
    }))
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

        // Persist unassignment to DB
        try {
          await fetch("/api/employees", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: String(employee.id), branchId: null }),
          })
        } catch (err) {
          console.error("Error persisting unassignment:", err)
        }

        showNotification(
          "info",
          "Employee Unassigned",
          `${employee.firstName} ${employee.surname} has been unassigned.`,
        )
      } else {
        // Save manual assignment locally first (offline experience)
        const branchName = branch ? branch.branchName : null
        if (branchName) {
          setManualAssignments((prev) => ({ ...prev, [String(employee.id)]: branchName }))
        } else {
          // Fallback: use branchId string if branch name unavailable
          setManualAssignments((prev) => ({ ...prev, [String(employee.id)]: String(branchId) }))
        }

        // Persist assignment to DB (users.branchId)
        try {
          await fetch("/api/employees", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: String(employee.id), branchId: String(branchId) }),
          })
        } catch (err) {
          console.error("Error persisting branch assignment:", err)
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

  const handleAssignCrew = (crewId: number, branchId: string) => {
    if (branchId) {
      const crew = crews.find((c) => c.id === crewId)
      const branch = branchId === "unassigned" ? null : branches.find((b) => b.id.toString() === branchId)

      if (branchId === "unassigned") {
        showNotification(
          "info",
          "Crew Unassigned",
          crew ? `${crew.firstName} ${crew.surname} has been unassigned.` : "Crew member has been unassigned.",
        )
      } else {
        assignCrewToBranch(crewId, Number.parseInt(branchId))

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
      console.log("[Manual Schedule] Saving schedule for date:", selectedDate)

      // Build complete assignments array (rotated + manual)
      const allAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string }> = []

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

          allAssignments.push({
            employeeId,
            employeeName,
            branchId,
            branchName,
            shift: emp.nextWeekShift || "AM",
          })
        }
      }

      // Add manual assignments
      for (const [employeeIdStr, branchName] of Object.entries(manualAssignments)) {
        const branch = fireBranches.find((b) => b.branchName === branchName)
        const employee = fireEmployees.find((e) => String(e.id) === employeeIdStr) || crews.find((c) => String(c.id) === employeeIdStr)

        if (employee && branch) {
          // Check if this employee-branch combo is already in rotated
          const alreadyAdded = allAssignments.some(
            (a) => String(a.employeeId) === String(employee.id) && String(a.branchId) === String(branch.id),
          )

          const employeeName = `${employee.firstName} ${employee.surname}`

          if (!alreadyAdded) {
            allAssignments.push({
              employeeId: String(employee.id),
              employeeName,
              branchId: String(branch.id),
              branchName: branch.branchName || branch.name,
              shift: "AM",
            })
          }

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
            console.log(`✓ Manual override saved for ${employeeName} on ${selectedDate}`)
          } catch (err) {
            console.error("Error saving manual override:", err)
          }
        }
      }

      // Save schedule documents for the full week (Mon-Fri)
      if (allAssignments.length > 0) {
        try {
          const currentTime = new Date().toTimeString().slice(0, 5)
          const weekBounds = getWeekBoundsFromDate(selectedDate)

          console.log("[Manual Schedule] Saving full week schedule:", weekBounds.weekStart, "-", weekBounds.weekEnd, "with", allAssignments.length, "assignments")

          // Delete any existing schedules for this week first to prevent duplicates
          try {
            await deleteSchedulesForWeek(weekBounds.weekStart)
          } catch (err) {
            console.warn("[Manual Schedule] Could not delete existing schedules:", err)
          }

          // Save 5 schedule documents (Mon-Fri)
          const mondayDate = new Date(weekBounds.weekStart + "T00:00:00")
          const savedDates: string[] = []

          for (let i = 0; i < 5; i++) {
            const d = new Date(mondayDate)
            d.setDate(mondayDate.getDate() + i)
            const dayISO = formatDateLocal(d)

            try {
              await addScheduleToFirestore({
                date: weekBounds.weekStart,
                scheduleFor: dayISO,
                time: currentTime,
                weekStart: weekBounds.weekStart,
                weekEnd: weekBounds.weekEnd,
                manuallyScheduled: true,
                assignments: allAssignments.map((a) => ({
                  employeeId: a.employeeId,
                  employeeName: a.employeeName,
                  branchId: a.branchId,
                  branchName: a.branchName,
                  isPresent: true,
                  shift: a.shift,
                })),
              })
              savedDates.push(dayISO)
            } catch (e) {
              console.warn("[Manual Schedule] Failed to save schedule for", dayISO, e)
            }
          }

          if (savedDates.length > 0) {
            const branchNames = [...new Set(allAssignments.map(a => a.branchName))].join(", ")
            showNotification("success", "Schedule Saved", `Manual schedule saved for ${savedDates.length} days (${savedDates[0]} - ${savedDates[savedDates.length - 1]}) with ${allAssignments.length} crew members across: ${branchNames}`)
            console.log("[Manual Schedule] Saved schedules for dates:", savedDates)
          } else {
            showNotification("error", "Save Error", "Failed to save any schedule documents")
          }

          // Refresh the current week schedule display
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
            const assignments = nextWeekRotationPreview.map((emp: any) => ({
              employeeId: String(emp.id),
              employeeName: `${emp.firstName} ${emp.surname}`,
              branchId: branchesList.find((b) => b.name === emp.nextWeekBranch)?.id || "",
              branchName: emp.nextWeekBranch,
              isPresent: true,
              shift: emp.nextWeekShift || "AM",
            }))
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
  const getWeekBoundsFromDate = (dateStr: string) => {
    // Parse as local date to avoid timezone issues
    const parts = dateStr.split("-")
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const currentDay = date.getDay()
    console.log("[getWeekBoundsFromDate] Input:", dateStr, "Parsed date:", date.toDateString(), "Day of week:", currentDay, "(0=Sunday)")

    // For Philippine standard (Monday-Sunday): Handle Sunday (day 0) specially
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const monday = new Date(date)
    monday.setDate(date.getDate() + daysToMonday)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const weekStart = formatDateLocal(monday)
    const weekEnd = formatDateLocal(sunday)
    console.log("[getWeekBoundsFromDate] Calculated:", weekStart, "-", weekEnd)

    return {
      weekStart,
      weekEnd,
    }
  }

  const getCurrentWeekDates = () => {
    const today = new Date()
    const currentDay = today.getDay()
    // For Philippine standard (Monday-Sunday): Handle Sunday (day 0) specially
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const monday = new Date(today)
    monday.setDate(today.getDate() + daysToMonday)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const formatDate = (date: Date) => {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }

    return `${formatDate(monday)} - ${formatDate(sunday)}`
  }

  const getNextWeekDates = () => {
    const today = new Date()
    const currentDay = today.getDay()
    // Get Monday of current week first
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const currentMonday = new Date(today)
    currentMonday.setDate(today.getDate() + daysToMonday)

    // Next week Monday is 7 days after current week Monday
    const nextMonday = new Date(currentMonday)
    nextMonday.setDate(currentMonday.getDate() + 7)

    const nextSunday = new Date(nextMonday)
    nextSunday.setDate(nextMonday.getDate() + 6)

    const formatDate = (date: Date) => {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }

    return `${formatDate(nextMonday)} - ${formatDate(nextSunday)}`
  }

  const getNextMondayDate = () => {
    const today = new Date()
    const currentDay = today.getDay()
    // Get Monday of current week first
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const currentMonday = new Date(today)
    currentMonday.setDate(today.getDate() + daysToMonday)

    // Next week Monday is 7 days after current week Monday
    const nextMonday = new Date(currentMonday)
    nextMonday.setDate(currentMonday.getDate() + 7)

    return nextMonday.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

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
                  <Badge variant="outline">{getNextMondayDate()}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">Total Crew Members:</span>
                  <Badge variant="outline">{(fireEmployees && fireEmployees.length > 0) ? fireEmployees.length : crews.length}</Badge>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleRegenerate}
                  disabled={branchesList.length === 0 || (crews.length === 0 && fireEmployees.length === 0)}
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

              {(branchesList.length === 0 || crews.length === 0) && (
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
                  getCurrentWeekDates()
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
                                  // Check if this employee has a manual override for today
                                  const today = formatDateLocal(new Date())
                                  const override = weeklyOverrides.find(
                                    (o) => String(o.employeeId) === String(employee.id) && o.date === today
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
                                  // Check if this employee has a manual override for today
                                  const today = formatDateLocal(new Date())
                                  const override = weeklyOverrides.find(
                                    (o) => String(o.employeeId) === String(employee.id) && o.date === today
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
                                // Check if this employee has a manual override for today
                                const today = formatDateLocal(new Date())
                                const override = weeklyOverrides.find(
                                  (o) => String(o.employeeId) === String(employee.id) && o.date === today
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
                      const dayAttendance = weekAttendance[dateISO] || []
                      const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
                      const dayDate = new Date(currentDate); dayDate.setHours(0, 0, 0, 0)
                      const isPastDay = dayDate < todayMidnight
                      const isToday = dayDate.getTime() === todayMidnight.getTime()

                      // Count statuses for summary
                      let presentCount = 0
                      let absentCount = 0
                      for (const ba of assignments) {
                        for (const emp of (ba.employees || [])) {
                          const hasOverride = weeklyOverrides.some(
                            (o: any) => String(o.employeeId) === String(emp.employeeId) && o.date === dateISO
                          )
                          const attRecord = dayAttendance.find(
                            (a: any) => String(a.employeeId) === String(emp.employeeId)
                          )
                          if (hasOverride) {
                            absentCount++
                          } else if (attRecord && attRecord.timeIn) {
                            presentCount++
                          } else if (isPastDay) {
                            absentCount++
                          }
                        }
                      }

                      details.push(
                        <div key={i} className="border rounded-lg">
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
                              <div className="text-sm font-medium">{dayName}, {dateStr}</div>
                              <div className="text-xs text-muted-foreground">
                                ({totalCrew} crew
                                {presentCount > 0 ? `, ${presentCount} present` : ""}
                                {absentCount > 0 ? `, ${absentCount} absent` : ""}
                                {!isPastDay && !isToday && presentCount === 0 && absentCount === 0 ? ", scheduled" : ""})
                              </div>
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
                                      const attRecord = dayAttendance.find(
                                        (a: any) => String(a.employeeId) === String(employee.employeeId)
                                      )

                                      // Determine status from actual data
                                      let status: string
                                      let statusColor: string
                                      if (override) {
                                        status = "Absent"
                                        statusColor = "text-amber-600"
                                      } else if (attRecord && attRecord.timeIn) {
                                        status = "Present"
                                        statusColor = "text-green-600"
                                      } else if (isPastDay) {
                                        status = "Absent"
                                        statusColor = "text-red-600"
                                      } else if (isToday) {
                                        status = "No Clock-in"
                                        statusColor = "text-gray-500"
                                      } else {
                                        status = "Scheduled"
                                        statusColor = "text-blue-600"
                                      }

                                      const displayBranch = override ? override.overrideBranchName : branchAssignment.branchName

                                      return (
                                        <div key={employee.employeeId} className="flex items-center justify-between text-xs p-1.5 rounded bg-background border">
                                          <div className="flex-1">
                                            <div className="font-medium">{employee.employeeName}</div>
                                            <div className="text-muted-foreground">{formatShift(employee.shift)} Shift</div>
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
                Next Week's Rotation ({getNextWeekDates()})
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
                <DialogTitle>Next Week's Rotation Preview ({getNextWeekDates()})</DialogTitle>
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
                  disabled={branchesList.length === 0 || (crews.length === 0 && fireEmployees.length === 0)}
                  onClick={async () => {
                    console.log("[Apply Rotation Button] Clicked - Starting handler...")
                    if (branchesList.length === 0 || (crews.length === 0 && fireEmployees.length === 0)) {
                      console.log("[Apply Rotation Button] Validation failed: branches or crews missing")
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
                      console.log("[Apply Rotation Button] No rotated employees available")
                      showNotification("info", "No Preview", "No rotation preview available. Click Regenerate to create a preview first.")
                      return
                    }

                    console.log("[Apply Rotation Button] Validation passed. rotatedEmployees:", rotatedEmployees.length)

                    // Compute current week's Monday and Sunday for applying the preview rotation to current week
                    const today = new Date()
                    const currentDay = today.getDay()
                    const currentMonday = new Date(today)
                    currentMonday.setDate(today.getDate() - currentDay + (currentDay === 0 ? -6 : 1))

                    const currentMondayISO = formatDateLocal(currentMonday)
                    const currentSundayISO = (() => { const s = new Date(currentMonday); s.setDate(currentMonday.getDate() + 6); return formatDateLocal(s) })()

                    // Build assignments for current week's schedule
                    const applyRotationAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string }> = []

                    for (const emp of rotatedEmployees) {
                      // Search in fireBranches first (same source the rotation algo used), then fall back to store branches
                      const targetBranch = fireBranches.find((b: any) => b.branchName === emp.nextWeekBranch || b.name === emp.nextWeekBranch)
                        || branches.find((b: any) => b.branchName === emp.nextWeekBranch)
                      if (targetBranch) {
                        const employeeName = `${emp.firstName} ${emp.surname}`
                        const branchName = targetBranch.branchName || targetBranch.name
                        applyRotationAssignments.push({
                          employeeId: String(emp.id),
                          employeeName,
                          branchId: String(targetBranch.id),
                          branchName,
                          shift: emp.nextWeekShift || "AM",
                        })
                        console.log("[Apply Rotation Button] Added assignment:", employeeName, "->", branchName)

                        // Update Zustand store for backward compatibility
                        const storeId = emp.storeCrewId ?? emp.id
                        assignCrewToBranch(storeId, targetBranch.id)

                        // Persist branchId to the database (users table)
                        try {
                          await fetch("/api/employees", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: String(emp.id), branchId: String(targetBranch.id) }),
                          })
                          console.log("[Apply Rotation] Persisted branchId to DB:", employeeName, "->", branchName)
                        } catch (err) {
                          console.error("[Apply Rotation] Failed to persist branchId for", employeeName, err)
                        }
                      } else {
                        console.warn("[Apply Rotation Button] No matching branch found for:", emp.nextWeekBranch)
                      }
                    }
                    console.log("[Apply Rotation Button] Built assignments:", applyRotationAssignments.length)

                    // Save as 7 schedule documents for current week (one per day, Mon-Sun)
                    if (applyRotationAssignments.length > 0) {
                      const startTime = "07:00" // Default AM time for applied rotations
                      console.log("[Apply Rotation] Saving schedules to Firestore (assignments):", applyRotationAssignments.length)
                      console.log("[Apply Rotation] Week:", currentMondayISO, "-", currentSundayISO)
                      try {
                        // Delete any existing schedules for current week
                        try {
                          await deleteSchedulesForWeek(currentMondayISO)
                        } catch (err) {
                          console.warn("[Apply Rotation] Could not delete existing schedules for current week:", err)
                        }

                        // Save 7 schedule documents (one per day of the week)
                        const savedDates: string[] = []
                        console.log("[Apply Rotation] Starting to save 7 documents for week")

                        for (let i = 0; i < 7; i++) {
                          const d = new Date(currentMonday)
                          d.setDate(currentMonday.getDate() + i)
                          const dayISO = formatDateLocal(d)
                          console.log(`[Apply Rotation] Saving document ${i + 1}/7 for ${dayISO}`)

                          try {
                            await addScheduleToFirestore({
                              date: currentMondayISO,
                              scheduleFor: dayISO,
                              time: startTime,
                              weekStart: currentMondayISO,
                              weekEnd: currentSundayISO,
                              assignments: applyRotationAssignments.map((a) => ({
                                employeeId: a.employeeId,
                                employeeName: a.employeeName,
                                branchId: a.branchId,
                                branchName: a.branchName,
                                isPresent: true,
                                shift: a.shift,
                              })),
                            })
                            savedDates.push(dayISO)
                            console.log(`[Apply Rotation] Successfully saved document for ${dayISO}`)
                          } catch (e) {
                            console.error("[Apply Rotation] Failed to save schedule for", dayISO, e)
                          }
                        }

                        console.log("[Apply Rotation] Total saved:", savedDates.length)
                        if (savedDates.length > 0) {
                          console.log("[Apply Rotation] Schedules saved successfully. Dates:", savedDates)
                          const branchNames = [...new Set(applyRotationAssignments.map(a => a.branchName))].join(", ")
                          showNotification("success", "Schedule Saved", `Applied rotation saved for ${savedDates.length} days (${savedDates[0]} - ${savedDates[savedDates.length - 1]}) for branches: ${branchNames}`)
                        } else {
                          showNotification("error", "Save Error", "Failed to save rotation to Firestore")
                        }
                      } catch (err) {
                        console.error("[Apply Rotation] Failed to save schedules to Firestore:", err)
                        showNotification("error", "Save Error", "Failed to save rotation to Firestore")
                      }
                    }

                    // Clear preview after applying (but keep manualAssignments — they are DB-persisted)
                    setRotatedEmployees([])

                    // Store the applied rotation to display in Current Schedules card
                    setAppliedRotation(rotatedEmployees)

                    // Refresh employee data and week schedules from DB
                    try {
                      const updatedEmployees = await getEmployeesFromFirestore()
                      setFireEmployees(updatedEmployees)
                    } catch (err) {
                      console.error("Error refreshing employees after rotation:", err)
                    }
                    await fetchWeekSchedulesFromFirestore()

                    // Generate a next-week preview so the "Next Week's Rotation" card is populated
                    const nextWeekPreview = generateRotation({ avoidSameBranch: true })
                    setNextWeekRotationPreview(nextWeekPreview)

                    showNotification("success", "Rotation Applied", "Next week's rotation has been scheduled and set as the current rotation.")
                    setShowRotationPreview(false)
                  }}
                >
                  Apply Rotation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Regenerate Confirmation Dialog */}
        <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New Rotation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Are you sure you want to generate a new rotation? This will create a new crew rotation for the current week and replace any existing schedule.
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={confirmRegenerate}>
                Yes, Generate
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
                    onClick={async () => {
                      setManualAssignments((prev) => ({ ...prev, ...pendingAssignments }))

                      // Persist each pending assignment to the users table (branchId) so it survives page reloads
                      for (const [employeeId, branchName] of Object.entries(pendingAssignments)) {
                        const branch = fireBranches.find((b: any) => b.branchName === branchName)
                        if (branch) {
                          try {
                            await fetch("/api/employees", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: employeeId, branchId: String(branch.id) }),
                            })
                          } catch (err) {
                            console.error("Error persisting branch assignment for", employeeId, err)
                          }
                        }
                      }

                      setPendingAssignments({})
                      // Refresh employee data to reflect persisted assignments
                      try {
                        const updatedEmployees = await getEmployeesFromFirestore()
                        setFireEmployees(updatedEmployees)
                      } catch (err) {
                        console.error("Error refreshing employees:", err)
                      }
                      showNotification("success", "Selections Saved", "Pending selections have been confirmed and persisted.")
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
                    if (!selectedBranch) {
                      // Branch was deleted — reset filter
                      setSelectedBranchForDisplay(null)
                      return <div className="text-center py-8 text-muted-foreground">Branch no longer exists. Showing all branches.</div>
                    }

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

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

// Scheduling now uses live store data. No local sampleEmployees are present so the app starts empty.
// Branches are loaded from the live crew store (managed in Branch Management). We derive a
// lightweight `branchesList` from the store inside the component so the UI and rotation
// algorithm always reflect the actual branches configured by the admin.

export default function SchedulingPage() {
  const { showNotification } = useNotification()
  const { branches, assignCrewToBranch, getCrewsForBranch, getActiveCrews, getAssignedBranch } = useCrewStore()

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
  const crews = storeCrews
  const hasInitialAssignments = crews.some((c) => (getAssignedBranch ? getAssignedBranch(c.id) : null))
  
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
    return monday.toISOString().split("T")[0]
  })
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("")
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
  const [debugStatus, setDebugStatus] = useState<string | null>(null)
  const [weeklyOverrides, setWeeklyOverrides] = useState<any[]>([])

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
      const idForPreview = matchedStoreCrew ? matchedStoreCrew.id : (c.id ?? `fire-${idx}`)

      return {
        id: idForPreview,
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

  // Clear any existing preview when the underlying store data changes (so a stale preview
  // isn't shown after branches/crews are edited). Do NOT regenerate automatically.
  useEffect(() => {
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
      } catch (err) {
        console.error("Error loading Firestore scheduling data:", err)
      }
    }

    fetchFireData()
  }, [])

  // Fetch current week's manual overrides
  const fetchWeeklyOverrides = async () => {
    try {
      const today = new Date().toISOString().split("T")[0]
      const overrides = await getOverridesForWeek(today)
      setWeeklyOverrides(overrides)
      console.log("Weekly overrides loaded:", overrides.length)
    } catch (err) {
      console.error("Error fetching weekly overrides:", err)
    }
  }

  useEffect(() => {
    fetchWeeklyOverrides()
  }, [])

  // Fetch current week's schedule and load it into appliedRotation
  const fetchCurrentWeekSchedule = async () => {
    try {
      // Look for any saved schedule within the current week (Mon-Sun) and use the latest one
      const todayDate = new Date()
      const day = todayDate.getDay()
      const monday = new Date(todayDate)
      monday.setDate(todayDate.getDate() - day + (day === 0 ? -6 : 1))

      let foundSchedules: Array<any> = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        const iso = d.toISOString().split("T")[0]
        try {
          const schedules = await getSchedulesForDateFromFirestore(iso)
          if (schedules && schedules.length > 0) {
            // attach the schedule date to help pick latest across week
            schedules.forEach((s: any) => (s._scheduleDate = iso))
            foundSchedules = foundSchedules.concat(schedules)
          }
        } catch (e) {
          console.warn("Error fetching schedules for", iso, e)
        }
      }

      if (foundSchedules.length > 0) {
        // pick the most recently updated/created schedule among all found
        const latestSchedule = foundSchedules.sort((a: any, b: any) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime()
          const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime()
          return dateB - dateA
        })[0]

        if (latestSchedule.branchAssignments && latestSchedule.branchAssignments.length > 0) {
          const rotationData: any[] = []
          for (const branchAssignment of latestSchedule.branchAssignments) {
            for (const employee of branchAssignment.employees) {
              rotationData.push({
                id: employee.employeeId,
                firstName: employee.employeeName ? employee.employeeName.split(" ")[0] : "Unknown",
                surname: employee.employeeName ? employee.employeeName.split(" ").slice(1).join(" ") : "",
                nextWeekBranch: branchAssignment.branchName,
                nextWeekShift: employee.shift || "AM",
              })
            }
          }
          setAppliedRotation(rotationData)
          // set applied schedule week range if available
          setAppliedScheduleWeek({
            weekStart: latestSchedule.weekStart || latestSchedule._scheduleDate,
            weekEnd: latestSchedule.weekEnd || latestSchedule._scheduleDate,
          })
          console.log("Current week schedule loaded from week:", latestSchedule._scheduleDate, rotationData.length, "assignments")
        }
      }
    } catch (err) {
      console.error("Error fetching current week schedule:", err)
    }
  }

  useEffect(() => {
    fetchCurrentWeekSchedule()
  }, [])

  // Generate next week's rotation preview (auto-updates when week changes or data changes)
  useEffect(() => {
    const generateNextWeekPreview = () => {
      const preview = generateRotation({ avoidSameBranch: true })
      setNextWeekRotationPreview(preview)
    }

    generateNextWeekPreview()

    // Update preview daily to catch week changes
    const interval = setInterval(generateNextWeekPreview, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [crews.length, branchesList.length, fireEmployees.length])

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
      const todayISO = new Date().toISOString().split("T")[0]

      // Build assignments for the regenerated rotation
      const regeneratedAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string }> = []

      for (const emp of next) {
        // Search in fireBranches first (same source the rotation algo used), then fall back to store branches
        const targetBranch = fireBranches.find((b: any) => b.branchName === emp.nextWeekBranch || b.name === emp.nextWeekBranch)
          || branches.find((b: any) => b.branchName === emp.nextWeekBranch)
        if (targetBranch) {
          // update in-memory store assignment (keeps other app logic working)
          try {
            assignCrewToBranch(emp.id, targetBranch.id)
            console.log("[Regenerate] Assigned crew", emp.id, "to branch", targetBranch.id)
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

          const currentMondayISO = currentMonday.toISOString().split("T")[0]
          const currentSundayISO = ((): string => { const s = new Date(currentMonday); s.setDate(currentMonday.getDate()+6); return s.toISOString().split("T")[0] })()

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
            const dayISO = d.toISOString().split("T")[0]

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

  const handleAssignCrewFirestore = (crewId: string | number, branchId: string, employee: any) => {
    if (branchId) {
      const branch = branchId === "unassigned" ? null : fireBranches.find((b) => String(b.id) === branchId)

      if (branchId === "unassigned") {
        // Remove any local manual assignment for this employee
        setManualAssignments((prev) => {
          const copy = { ...prev }
          delete copy[String(employee.id)]
          return copy
        })

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

  const handleSaveSchedule = () => {
    setScheduleDate(selectedDate)
    setScheduleTime(new Date().toTimeString().slice(0, 5))
    setShowSaveModal(true)
  }

  const handleSchedulePost = async () => {
    if (!scheduleDate || !scheduleTime) {
      showNotification("error", "Validation Error", "Date and time are required")
      return
    }

    console.log("Schedule posted for:", scheduleDate, scheduleTime)

    try {
      // Build complete assignments array (rotated + manual)
      const allAssignments: Array<{ employeeId: string; employeeName: string; branchId: string; branchName?: string; shift?: string }> = []

      // Add rotated employees
      if (rotatedEmployees && rotatedEmployees.length > 0) {
        for (const emp of rotatedEmployees) {
          const fireBranch = fireBranches.find((fb: any) => fb.branchName === emp.nextWeekBranch || fb.name === emp.nextWeekBranch)

          // try to match crew by email first, then by name
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
            const dayOfWeek = new Date(scheduleDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })
            await saveManualOverride({
              employeeId: String(employee.id),
              employeeName,
              date: scheduleDate,
              dayOfWeek,
              overrideBranchId: String(branch.id),
              overrideBranchName: branch.branchName || branch.name,
              shift: "AM",
              reason: "Manual override for schedule",
            })
            console.log(`✓ Manual override saved for ${employeeName} on ${scheduleDate}`)
          } catch (err) {
            console.error("Error saving manual override:", err)
            // Don't fail the entire save if override saving fails
          }
        }
      }

      // Build branch assignments - include ALL branches, even those without employees
      const branchAssignments = fireBranches.map((branch) => {
        const branchEmployees = allAssignments.filter((a) => String(a.branchId) === String(branch.id))
        return {
          branchId: String(branch.id),
          branchName: branch.branchName,
          employees: branchEmployees,
        }
      })

      // Save as 7 schedule documents (one per day of the week, starting from selected date's Monday)
      if (fireBranches.length > 0) {
        try {
          console.log("Saving schedule posts to Firestore (allAssignments):", allAssignments.length)
          // compute week start (Monday) and end (Sunday) for the provided scheduleDate
          const sd = new Date(scheduleDate + "T00:00:00")
          const sdDay = sd.getDay()
          const weekStartDate = new Date(sd)
          weekStartDate.setDate(sd.getDate() - sdDay + (sdDay === 0 ? -6 : 1))
          const weekEndDate = new Date(weekStartDate)
          weekEndDate.setDate(weekStartDate.getDate() + 6)

          const weekStartISO = weekStartDate.toISOString().split("T")[0]
          const weekEndISO = weekEndDate.toISOString().split("T")[0]

          // Delete any existing schedules for this week
          try {
            await deleteSchedulesForWeek(weekStartISO)
          } catch (err) {
            console.warn("Could not delete existing schedules for week:", err)
          }

          // Save 7 schedule documents (one per day of the week)
          const savedDates: string[] = []
          for (let i = 0; i < 7; i++) {
            const d = new Date(weekStartDate)
            d.setDate(weekStartDate.getDate() + i)
            const dayISO = d.toISOString().split("T")[0]

            try {
              await addScheduleToFirestore({
                date: weekStartISO, // Save date is Monday of the week
                scheduleFor: dayISO, // Specific date this schedule is for
                time: scheduleTime,
                weekStart: weekStartISO,
                weekEnd: weekEndISO,
                assignments: allAssignments.map((a) => ({
                  employeeId: a.employeeId,
                  employeeName: a.employeeName,
                  branchId: a.branchId,
                  branchName: a.branchName,
                  isPresent: true, // Default to present; can be updated later
                  shift: a.shift,
                })),
              })
              savedDates.push(dayISO)
            } catch (e) {
              console.warn("Failed to save schedule for", dayISO, e)
            }
          }

          if (savedDates.length > 0) {
            console.log("Schedule posts saved for dates:", savedDates)
            const branchNames = [...new Set(allAssignments.map(a => a.branchName))].join(", ")
            showNotification("success", "Schedule Saved", `Schedule saved for ${savedDates.length} days (${savedDates[0]} - ${savedDates[savedDates.length - 1]}) for branches: ${branchNames}`)
          } else {
            showNotification("error", "Save Error", "Failed to save schedules to Firestore")
            setShowSaveModal(false)
            return
          }
        } catch (err) {
          console.error("Error saving schedules:", err)
          showNotification("error", "Save Error", "Failed to persist schedules to Firestore")
          setShowSaveModal(false)
          return
        }
      }
    } catch (err) {
      console.error("Error saving schedules:", err)
      showNotification("error", "Save Error", "Failed to persist schedules to Firestore")
      setShowSaveModal(false)
      return
    }

    setShowSaveModal(false)

    showNotification("success", "Schedule Saved", `Schedule has been saved for ${scheduleDate} at ${scheduleTime}.`)
  }

  const getCurrentWeekDates = () => {
    const today = new Date()
    const currentDay = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - currentDay + 1)

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
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() - currentDay + 8)

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
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() - currentDay + 8)

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

      {process.env.NODE_ENV === "development" && (
        <Card>
          <CardHeader>
            <CardTitle>Firestore Debug</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <div>Project: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "(not set)"}</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    setDebugStatus("Calling addScheduleToFirestore...")
                    try {
                      const todayISO = new Date().toISOString().split("T")[0]
                      const nowTime = new Date().toTimeString().slice(0, 5)
                      const id = await addScheduleToFirestore({ date: todayISO, time: nowTime, assignments: [] })
                      setDebugStatus(`Saved: ${id}`)
                    } catch (e: any) {
                      console.error("Test save error:", e)
                      setDebugStatus(`Error: ${e?.message || String(e)}`)
                    }
                  }}
                >
                  Test Firestore Save
                </Button>
                <Button variant="ghost" onClick={() => setDebugStatus(null)}>Clear</Button>
              </div>
              {debugStatus && <div className="text-sm text-muted-foreground">{debugStatus}</div>}
            </div>
          </CardContent>
        </Card>
      )}

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
                    onClick={() => {
                      // Generate a non-destructive preview from the current schedule and open the dialog.
                      const next = generateRotation({ avoidSameBranch: true })
                      setRotatedEmployees(next)
                      setShowRotationPreview(true)
                      if (!next || next.length === 0) {
                        showNotification("info", "No Preview", "No preview generated. Ensure branches and crews exist.")
                      }
                    }}
                    disabled={branchesList.length === 0 || crews.length === 0}
                  >
                    Preview Next Week's Rotation
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
                                  const today = new Date().toISOString().split("T")[0]
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
                                  const today = new Date().toISOString().split("T")[0]
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
                                const today = new Date().toISOString().split("T")[0]
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

          <Card className="border-dashed">
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
                  No preview available yet. Click "Preview Next Week's Rotation" to generate.
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
                  disabled={branchesList.length === 0 || crews.length === 0}
                  onClick={async () => {
                    console.log("[Apply Rotation Button] Clicked - Starting handler...")
                    if (branchesList.length === 0 || crews.length === 0) {
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
                    
                    const currentMondayISO = currentMonday.toISOString().split("T")[0]
                    const currentSundayISO = ((): string => { const s = new Date(currentMonday); s.setDate(currentMonday.getDate() + 6); return s.toISOString().split("T")[0] })()

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

                        // Also update current assignment so the applied preview becomes the current rotation
                        assignCrewToBranch(emp.id, targetBranch.id)
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
                          const dayISO = d.toISOString().split("T")[0]
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

                    // Clear preview/manual overrides after applying so Preview is reset
                    setRotatedEmployees([])
                    setManualAssignments({})
                    
                    // Store the applied rotation to display in Current Schedules card
                    setAppliedRotation(rotatedEmployees)

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
                      setManualAssignments((prev) => ({ ...prev, ...pendingAssignments }))
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

      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Schedule Post Options</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="scheduleDate">Date</Label>
              <Input
                id="scheduleDate"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scheduleTime">Time</Label>
              <Input
                id="scheduleTime"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSaveModal(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSchedulePost} className="w-full sm:w-auto">
              Schedule Post
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

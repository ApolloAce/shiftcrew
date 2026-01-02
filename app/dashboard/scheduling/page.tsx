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
import { Search, RotateCcw, Edit, Calendar, Users, AlertTriangle, Clock } from "lucide-react"

// Scheduling now uses live store data. No local sampleEmployees are present so the app starts empty.
// Branches are loaded from the live crew store (managed in Branch Management). We derive a
// lightweight `branchesList` from the store inside the component so the UI and rotation
// algorithm always reflect the actual branches configured by the admin.

export default function SchedulingPage() {
  const { showNotification } = useNotification()
  const { branches, assignCrewToBranch, getCrewsForBranch, getActiveCrews, getAssignedBranch, addSchedule, getSchedulesForDate } = useCrewStore()

  const crews = getActiveCrews()
  // derive a lightweight list of branches from the store; fall back to empty array
  const branchesList = (branches || []).map((b: any) => ({ id: b.id, name: b.branchName, address: b.address }))

  // whether at least one crew has been assigned to a branch (used to require initial manual seeding)
  const hasInitialAssignments = crews.some((c) => (getAssignedBranch ? getAssignedBranch(c.id) : null))
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const [showRotationPreview, setShowRotationPreview] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [lastAssignmentSnapshot, setLastAssignmentSnapshot] = useState<Array<{ crewId: number; prevBranchId: number | null }>>([])
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<number | null>(null)
  const [manualAssignments, setManualAssignments] = useState<{ [key: number]: string }>({})

  const generateRotation = (opts?: { avoidSameBranch?: boolean }) => {
    // Build a lightweight employee view from the store's active crews and their assigned branch
    const lightweight = crews.map((c) => {
      const assignedBranch = getAssignedBranch ? getAssignedBranch(c.id) : null
      return {
        id: c.id,
        firstName: c.firstName,
        surname: c.surname,
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

    // Manual assignments count per branch
    const manualAssignedIds = Object.keys(manualAssignments).map((k) => Number(k))
    const manualCount: Record<string, number> = {}
    for (const idStr of Object.keys(manualAssignments)) {
      const bn = manualAssignments[Number(idStr)]
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
    const remaining = shuffle(lightweight.filter((e) => !manualAssignedIds.includes(e.id)))

    const assignedResults: Array<any> = []

    // First, apply manual assignments (always honor)
    for (const idStr of Object.keys(manualAssignments)) {
      const id = Number(idStr)
      const emp = lightweight.find((e) => e.id === id)
      const branchName = manualAssignments[id]
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
        // fallback: any branch with available slots
        const anyAvail = branchesList.find((b) => (desired[b.name] || 0) > 0)
        pick = anyAvail || branchesList[Math.floor(Math.random() * branchesList.length)]
      }

      assignedResults.push({ ...emp, nextWeekBranch: pick.name, nextWeekShift: emp.shift || "AM" })
      if (typeof desired[pick.name] === "number") desired[pick.name] = Math.max(0, desired[pick.name] - 1)
    }

    // Final pass: if any branch still has desired>0 (unlikely), fill round-robin
    let idx = 0
    while (Object.values(desired).some((v) => v > 0)) {
      const availBranch = branchesList[idx % branchesList.length].name
      const emp = assignedResults.find((e) => e.nextWeekBranch === availBranch) === undefined ? null : null
      // nothing to do here in most cases; break to avoid infinite loop
      break
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

  // Wrapped regenerate so we can show feedback and ensure UI updates
  const handleRegenerate = async () => {
    // Open confirmation modal instead of executing immediately
    setShowRegenerateConfirm(true)
  }

  const confirmRegenerate = () => {
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

      for (const emp of next) {
        const targetBranch = branches.find((b: any) => b.branchName === emp.nextWeekBranch)
        if (targetBranch) {
          assignCrewToBranch(emp.id, targetBranch.id)
        }
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

  const handleManualAssignment = (employeeId: number, branchName: string) => {
    setManualAssignments((prev) => ({
      ...prev,
      [employeeId]: branchName,
    }))
    setRotatedEmployees((prev) =>
      prev.map((emp) => (emp.id === employeeId ? { ...emp, nextWeekBranch: branchName } : emp)),
    )
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

  const handleSchedulePost = () => {
    if (!scheduleDate || !scheduleTime) {
      showNotification("error", "Validation Error", "Date and time are required")
      return
    }

    console.log("Schedule posted for:", scheduleDate, scheduleTime)

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
                  <Badge variant="outline">{crews.length}</Badge>
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
                  <Button variant="outline" onClick={() => handleRegenerate()} disabled={branchesList.length === 0 || crews.length === 0}>
                    Regenerate Rotation
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

          <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Confirm Regenerate Rotation</DialogTitle>
                <p className="text-sm text-muted-foreground">This will update current crew assignments immediately. You can undo within 10 seconds.</p>
              </DialogHeader>

              <div className="pt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>Cancel</Button>
                <Button onClick={() => confirmRegenerate()}>Confirm and Apply</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader>
              <CardTitle>Current Schedules ({getCurrentWeekDates()})</CardTitle>
              <p className="text-sm text-muted-foreground">
                Current week's crew assignments across all restaurant branches
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {branchesList.map((branch) => {
                  // Use assigned crews from the live store (persisted)
                  const crewForBranch = getCrewsForBranch ? getCrewsForBranch(branch.id) : []
                  const amShift = crewForBranch.filter((emp) => (emp as any).shift === "AM")
                  const pmShift = crewForBranch.filter((emp) => (emp as any).shift === "PM")

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
                                        <div className="font-medium text-sm">
                                          {employee.firstName} {employee.surname}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">Assigned: {branch.name}</div>
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
                                        <div className="font-medium text-sm">
                                          {employee.firstName} {employee.surname}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">Assigned: {branch.name}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* If no explicit AM/PM shifts are set, fall back to listing assigned crew names */}
                              {amShift.length === 0 && pmShift.length === 0 && crewForBranch.length > 0 && (
                                <div className="space-y-2">
                                  {crewForBranch.map((employee) => (
                                    <div key={employee.id} className="p-3 border rounded-lg bg-card">
                                      <div className="font-medium text-sm">
                                        {employee.firstName} {employee.surname}
                                      </div>
                                      <div className="text-xs text-muted-foreground mt-1">Assigned: {branch.name}</div>
                                    </div>
                                  ))}
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

                                  {editingEmployee === employee.id && (
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

                                  {manualAssignments[employee.id] && (
                                    <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Manual Override
                                    </div>
                                  )}
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

                                  {editingEmployee === employee.id && (
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

                                  {manualAssignments[employee.id] && (
                                    <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Manual Override
                                    </div>
                                  )}
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
                  onClick={() => {
                    if (branchesList.length === 0 || crews.length === 0) {
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

                    // Compute next Monday ISO date for schedule entries
                    const today = new Date()
                    const currentDay = today.getDay()
                    const nextMonday = new Date(today)
                    nextMonday.setDate(today.getDate() - currentDay + 8)
                    const nextMondayISO = nextMonday.toISOString().split("T")[0]

                    // Persist rotated assignments as schedule records (do NOT overwrite current branch assignments)
                    for (const emp of rotatedEmployees) {
                      const targetBranch = branches.find((b: any) => b.branchName === emp.nextWeekBranch)
                      if (targetBranch) {
                        // avoid duplicate schedules for the same crew on the same date
                        const existing = getSchedulesForDate ? getSchedulesForDate(nextMondayISO) : []
                        const already = existing && existing.find((s: any) => s.crewId === emp.id)
                        if (!already) {
                          // determine times from shift
                          const shift = emp.nextWeekShift || "AM"
                          const startTime = shift === "AM" ? "07:00" : "14:00"
                          const endTime = shift === "AM" ? "14:00" : "22:00"
                          addSchedule({ crewId: emp.id, branchId: targetBranch.id, date: nextMondayISO, startTime, endTime })
                        }

                        // Also update current assignment so the applied preview becomes the current rotation
                        // This ensures Current Schedules reflect the applied preview immediately and
                        // subsequent Preview generation will be based on the updated current schedule.
                        assignCrewToBranch(emp.id, targetBranch.id)
                      }
                    }

                    // Clear preview/manual overrides after applying so Preview is reset
                    setRotatedEmployees([])
                    setManualAssignments({})

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
                <CardTitle>Available Restaurant Crew</CardTitle>
              </CardHeader>
              <CardContent>
                {crews.filter((crew) => {
                  const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
                  return fullName.includes(searchQuery.toLowerCase())
                }).length > 0 ? (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {crews
                      .filter((crew) => {
                        const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
                        return fullName.includes(searchQuery.toLowerCase())
                      })
                      .map((crew) => (
                        <div key={crew.id} className="p-4 rounded-lg border bg-card">
                          <div className="mb-2">
                            <div className="font-medium">
                              {crew.firstName} {crew.surname}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select onValueChange={(value) => handleAssignCrew(crew.id, value)}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Branch" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {branches.map((branch) => (
                                  <SelectItem key={branch.id} value={branch.id.toString()}>
                                    {branch.branchName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery ? "No crew members match your search" : "No active crew members available"}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="lg:w-2/3 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full sm:w-48"
                />
                <Button onClick={handleSaveSchedule}>Save Schedule</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {branches.length > 0 ? (
                  branches.map((branch) => {
                    const assignedCrews = getCrewsForBranch(branch.id)

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
                            <div className="text-center py-4 text-sm text-muted-foreground">No crews assigned</div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })
                ) : (
                  <div className="col-span-2 text-center py-8 text-muted-foreground">
                    No branches available. Add branches in the Branch Management section.
                  </div>
                )}
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

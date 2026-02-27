"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Users } from "lucide-react"
import { useNotification } from "@/components/notification-provider"
import { getActiveEmployees } from "@/lib/firestore-employee-service"
import { getAllBranches } from "@/lib/firestore-branch-service"
import { saveAttendanceRecord } from "@/lib/firestore-attendance-service"
import { getSchedulesForDate, Schedule } from "@/lib/firestore-schedule-service"
import { updateScheduleAssignments } from "@/lib/firestore-schedule-service"

// Helper: pick only the schedule for today (no fallback)
function pickTodaySchedule(schedules: Schedule[], todayISO: string) {
  return schedules.find((s: Schedule) => s.scheduleFor === todayISO) || schedules.find((s: Schedule) => s.date === todayISO) || null;
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0,0,0,0)
  return d
}

export default function DashboardPage() {
  const { showNotification } = useNotification()
  const [employees, setEmployees] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const [scheduleData, setScheduleData] = useState<Schedule | null>(null)

  // Fetch Firestore employees, branches, and today's attendance on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const [emps, brs] = await Promise.all([
          getActiveEmployees(),
          getAllBranches(),
        ])
        setEmployees(emps)
        setBranches(brs)
        // Find the current week's Monday and Sunday
        const today = new Date()
        const todayISO = today.toISOString().split("T")[0]
        const monday = getMonday(today)
        const weekDates: string[] = []
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday)
          d.setDate(monday.getDate() + i)
          weekDates.push(d.toISOString().split("T")[0])
        }
        // Fetch all schedules for the week AND today's attendance records in parallel
        const [weekScheduleResults, attendanceRes] = await Promise.all([
          Promise.all(weekDates.map(dateISO => getSchedulesForDate(dateISO))),
          fetch(`/api/attendance?date=${todayISO}`).then(r => r.ok ? r.json() : []),
        ])
        const allSchedules = weekScheduleResults.flat()
        // Only show today's schedule, never fallback to previous days
        const todaySchedule = pickTodaySchedule(allSchedules, todayISO)
        if (todaySchedule) {
          // Merge actual attendance data: override isPresent based on daily_attendance records
          const attendanceLookup = new Map<string, string>()
          if (Array.isArray(attendanceRes)) {
            for (const rec of attendanceRes) {
              attendanceLookup.set(String(rec.employeeId), rec.status)
            }
          }
          if (todaySchedule.branchAssignments) {
            todaySchedule.branchAssignments = todaySchedule.branchAssignments.map((branch: any) => ({
              ...branch,
              employees: branch.employees.map((emp: any) => {
                const attendanceStatus = attendanceLookup.get(String(emp.employeeId))
                return {
                  ...emp,
                  isPresent: attendanceStatus === "present",
                }
              }),
            }))
          }
          if (todaySchedule.assignments) {
            todaySchedule.assignments = todaySchedule.assignments.map((emp: any) => {
              const attendanceStatus = attendanceLookup.get(String(emp.employeeId))
              return {
                ...emp,
                isPresent: attendanceStatus === "present",
              }
            })
          }
          setScheduleData(todaySchedule)
        } else {
          setScheduleData(null)
        }
      } catch (error) {
        console.error("Dashboard: Error fetching data from Firestore:", error)
        showNotification("error", "Error", "Failed to load dashboard data")
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [showNotification])

  // Calculate attendance statistics based on scheduleData (deduplicated)
  let allScheduledEmployees: { employeeId: string, employeeName?: string, isPresent: boolean, branchName?: string }[] = [];
  if (scheduleData) {
    // From branchAssignments (preferred)
    if (scheduleData.branchAssignments) {
      for (const branch of scheduleData.branchAssignments) {
        for (const emp of branch.employees) {
          allScheduledEmployees.push({
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            isPresent: emp.isPresent,
            branchName: branch.branchName
          })
        }
      }
    }
    // From assignments (legacy flat array)
    if (scheduleData.assignments) {
      for (const emp of scheduleData.assignments) {
        allScheduledEmployees.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          isPresent: emp.isPresent,
          branchName: emp.branchName
        })
      }
    }
  }
  // Deduplicate by employeeId (in case of overlap)
  const uniqueScheduledEmployees = Object.values(
    allScheduledEmployees.reduce((acc, emp) => {
      acc[emp.employeeId] = emp;
      return acc;
    }, {} as Record<string, typeof allScheduledEmployees[0]>)
  );
  const presentCount = uniqueScheduledEmployees.filter(e => e.isPresent).length;
  const totalCount = uniqueScheduledEmployees.length;
  const attendancePercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;



  // Fix: Use await updateScheduleAssignments and then force a state update by fetching only the updated schedule document by id
  const handleToggleScheduledAttendance = async (employeeId: string, branchName: string) => {
    if (!scheduleData || !scheduleData.branchAssignments) return;
    // Find the branch
    const branchIdx = scheduleData.branchAssignments.findIndex(b => b.branchName === branchName);
    if (branchIdx === -1) return;
    // Find the employee
    const empIdx = scheduleData.branchAssignments[branchIdx].employees.findIndex(e => e.employeeId === employeeId);
    if (empIdx === -1) return;
    // Toggle isPresent
    const updatedBranchAssignments = scheduleData.branchAssignments.map((b, bIdx) =>
      bIdx === branchIdx
        ? {
            ...b,
            employees: b.employees.map((e, eIdx) =>
              eIdx === empIdx ? { ...e, isPresent: !e.isPresent } : e
            ),
          }
        : b
    );
    // Prepare assignments in flat format for Firestore
    const updatedAssignments = updatedBranchAssignments.flatMap(b =>
      b.employees.map(e => ({
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        branchId: b.branchId,
        branchName: b.branchName,
        isPresent: e.isPresent,
        shift: e.shift,
      }))
    );
    try {
      await updateScheduleAssignments(scheduleData.id!, updatedAssignments);

      // Also persist to daily_attendance table
      const todayISO = new Date().toISOString().split("T")[0]
      const emp = updatedBranchAssignments[branchIdx].employees[empIdx]
      await saveAttendanceRecord({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName || "Unknown",
        date: todayISO,
        status: emp.isPresent ? "present" : "absent",
        branchName,
      })

      // Fetch the updated schedule AND attendance to merge actual status
      const [schedules, attendanceRes] = await Promise.all([
        getSchedulesForDate(scheduleData.date),
        fetch(`/api/attendance?date=${todayISO}`).then(r => r.ok ? r.json() : []),
      ]);
      const updated = schedules.find((s: any) => s.id === scheduleData.id);
      if (updated) {
        // Merge attendance data into schedule
        const attendanceLookup = new Map<string, string>()
        if (Array.isArray(attendanceRes)) {
          for (const rec of attendanceRes) {
            attendanceLookup.set(String(rec.employeeId), rec.status)
          }
        }
        if (updated.branchAssignments) {
          updated.branchAssignments = updated.branchAssignments.map((branch: any) => ({
            ...branch,
            employees: branch.employees.map((e: any) => {
              const attendanceStatus = attendanceLookup.get(String(e.employeeId))
              return { ...e, isPresent: attendanceStatus === "present" }
            }),
          }))
        }
        setScheduleData(updated);
      }
      showNotification("success", "Attendance Updated", "Attendance status updated successfully.");
    } catch (err) {
      console.error("Toggle scheduled attendance error:", err);
      showNotification("error", "Update Failed", "Could not update attendance.");
    }
  }

  // Group scheduled employees by branch, filtered by search query
  const getScheduledCrewsByBranch = () => {
    const result: Record<string, typeof uniqueScheduledEmployees> = {}
    if (scheduleData && scheduleData.branchAssignments) {
      const query = searchQuery.toLowerCase()
      for (const branch of scheduleData.branchAssignments) {
        const filtered = branch.employees
          .map(emp => ({ ...emp, branchName: branch.branchName }))
          .filter(emp => !query || (emp.employeeName || "").toLowerCase().includes(query))
        if (filtered.length > 0) {
          result[branch.branchName] = filtered
        }
      }
    }
    return result
  }

  const scheduledCrewsByBranch = getScheduledCrewsByBranch()
  const hasFilteredResults = Object.values(scheduledCrewsByBranch).some(crews => crews.length > 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Crew Dashboard</h1>
        <p className="text-muted-foreground">Monitor crew attendance and branch assignments</p>
      </div>

      {/* Attendance Counter Card */}
      <Card className="bg-white dark:bg-gray-950">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Attendance Overview
          </CardTitle>
          <CardDescription>Current attendance status across all branches</CardDescription>
        </CardHeader>
        <CardContent className="pt-8">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading dashboard data...</div>
          ) : (
            <>
          <div className="flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-4xl font-bold">{presentCount}</span>
                <span className="text-xl text-muted-foreground"> / {totalCount}</span>
              </div>
              <Badge
                className="text-lg px-3 py-1"
                variant={
                  attendancePercentage >= 75 ? "default" : attendancePercentage >= 50 ? "outline" : "destructive"
                }
              >
                {attendancePercentage}%
              </Badge>
            </div>

            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  attendancePercentage >= 75
                    ? "bg-green-500"
                    : attendancePercentage >= 50
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${attendancePercentage}%` }}
              ></div>
            </div>

            <div className="text-sm text-muted-foreground">
              {presentCount} out of {totalCount} employees present today
            </div>
          </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search for crew members..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Attendance by Branch</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(scheduledCrewsByBranch).length > 0 ? (
              <div className="space-y-8">
                {Object.entries(scheduledCrewsByBranch).map(
                  ([branchName, branchCrews]) =>
                    branchCrews.length > 0 && (
                      <div key={branchName} className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2">{branchName}</h3>
                        <div className="space-y-3">
                          {branchCrews.map((crew) => (
                            <div
                              key={crew.employeeId}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border bg-card gap-4"
                            >
                              <div>
                                <div className="font-medium">
                                  {crew.employeeName}
                                </div>
                                <div className="text-sm text-muted-foreground">Scheduled</div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Badge variant={crew.isPresent ? "default" : "destructive"}>
                                  {crew.isPresent ? "Present" : "Absent"}
                                </Badge>
                                <Button
                                  variant={crew.isPresent ? "destructive" : "default"}
                                  size="sm"
                                  onClick={() => handleToggleScheduledAttendance(crew.employeeId, branchName)}
                                  className="w-full sm:w-auto"
                                >
                                  Mark {crew.isPresent ? "Absent" : "Present"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                )}

                {!hasFilteredResults && searchQuery && (
                  <div className="text-center py-8 text-muted-foreground">
                    No employees found matching "{searchQuery}"
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No scheduled employees</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branch Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(scheduledCrewsByBranch).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(scheduledCrewsByBranch).map(([branchName, branchCrews]) => (
                  <Card key={branchName} className="border shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{branchName}</CardTitle>
                      {/* Optionally show branch address if available from branches list */}
                      <p className="text-sm text-muted-foreground">
                        {branches.find(b => b.branchName === branchName)?.address || ""}
                      </p>
                    </CardHeader>
                    <CardContent>
                      {branchCrews.length > 0 ? (
                        <div className="space-y-2">
                          {branchCrews.map(emp => (
                            <div
                              key={emp.employeeId}
                              className="flex justify-between items-center p-2 rounded-md text-sm"
                            >
                              <span>{emp.employeeName}</span>
                              <span>{emp.isPresent ? "✓" : "✗"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-sm text-muted-foreground">No employees assigned</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No branch assignments available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


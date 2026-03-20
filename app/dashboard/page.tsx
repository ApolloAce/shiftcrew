"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Users, UserPlus, Calendar, Building, FileText, BarChart, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react"
import { useNotification } from "@/components/notification-provider"
import { getActiveEmployees } from "@/lib/firestore-employee-service"
import { getAllBranches } from "@/lib/firestore-branch-service"
import { saveAttendanceRecord } from "@/lib/firestore-attendance-service"
import { getSchedulesForDate, Schedule } from "@/lib/firestore-schedule-service"
import { updateScheduleAssignments } from "@/lib/firestore-schedule-service"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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

type StatusFilter = "all" | "present" | "absent" | "undertime"
const ITEMS_PER_PAGE = 10

export default function DashboardPage() {
  const { showNotification } = useNotification()
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [leaveCount, setLeaveCount] = useState(0)
  const [approvedLeaves, setApprovedLeaves] = useState<any[]>([])
  const [todayAbsences, setTodayAbsences] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<{ name?: string; firstName?: string } | null>(null)

  const [scheduleData, setScheduleData] = useState<Schedule | null>(null)

  useEffect(() => {
    try {
      const user = sessionStorage.getItem("currentUser")
      if (user) setCurrentUser(JSON.parse(user))
    } catch {}
  }, [])

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

        const today = new Date()
        const todayISO = today.toISOString().split("T")[0]
        const monday = getMonday(today)
        const weekDates: string[] = []
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday)
          d.setDate(monday.getDate() + i)
          weekDates.push(d.toISOString().split("T")[0])
        }

        const [weekScheduleResults, attendanceRes, leaveRes, absencesRes] = await Promise.all([
          Promise.all(weekDates.map(dateISO => getSchedulesForDate(dateISO))),
          fetch(`/api/attendance?date=${todayISO}`).then(r => r.ok ? r.json() : []),
          Promise.all([
            fetch("/api/leave?status=approved").then(r => r.ok ? r.json() : []),
            fetch("/api/leave?status=pending").then(r => r.ok ? r.json() : []),
          ]).then(([approved, pending]) => [...approved, ...pending]),
          fetch(`/api/absences?date=${todayISO}`).then(r => r.ok ? r.json() : []),
        ])

        if (Array.isArray(leaveRes)) {
          setLeaveCount(leaveRes.length)
          setApprovedLeaves(leaveRes)
        }
        if (Array.isArray(absencesRes)) setTodayAbsences(absencesRes)

        const allSchedules = weekScheduleResults.flat()
        const todaySchedule = pickTodaySchedule(allSchedules, todayISO)
        if (todaySchedule) {
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
                  isPresent: attendanceStatus === "present" || attendanceStatus === "undertime",
                  attendanceStatus: attendanceStatus || null,
                }
              }),
            }))
          }
          if (todaySchedule.assignments) {
            todaySchedule.assignments = todaySchedule.assignments.map((emp: any) => {
              const attendanceStatus = attendanceLookup.get(String(emp.employeeId))
              return {
                ...emp,
                isPresent: attendanceStatus === "present" || attendanceStatus === "undertime",
                attendanceStatus: attendanceStatus || null,
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

  // Calculate attendance statistics
  let allScheduledEmployees: { employeeId: string, employeeName?: string, employeeCode?: string, isPresent: boolean, branchName?: string, attendanceStatus?: string | null }[] = [];
  if (scheduleData) {
    const empLookup = new Map(employees.map((e: any) => [String(e.id), e]))
    if (scheduleData.branchAssignments) {
      for (const branch of scheduleData.branchAssignments) {
        for (const emp of branch.employees) {
          const empData = empLookup.get(String(emp.employeeId))
          allScheduledEmployees.push({
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            employeeCode: empData?.employeeCode || undefined,
            isPresent: emp.isPresent,
            branchName: branch.branchName,
            attendanceStatus: (emp as any).attendanceStatus || null,
          })
        }
      }
    }
    if (scheduleData.assignments) {
      for (const emp of scheduleData.assignments) {
        const empData = empLookup.get(String(emp.employeeId))
        allScheduledEmployees.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          employeeCode: empData?.employeeCode || undefined,
          isPresent: emp.isPresent,
          branchName: emp.branchName,
          attendanceStatus: (emp as any).attendanceStatus || null,
        })
      }
    }
  }
  const uniqueScheduledEmployees = Object.values(
    allScheduledEmployees.reduce((acc, emp) => {
      acc[emp.employeeId] = emp;
      return acc;
    }, {} as Record<string, typeof allScheduledEmployees[0]>)
  );
  const presentCount = uniqueScheduledEmployees.filter(e => e.isPresent && e.attendanceStatus !== "undertime").length;
  const undertimeCount = uniqueScheduledEmployees.filter(e => e.attendanceStatus === "undertime").length;
  const totalCount = uniqueScheduledEmployees.length;
  const absentCount = totalCount - presentCount - undertimeCount;
  const attendancePercentage = totalCount > 0 ? Math.round(((presentCount + undertimeCount) / totalCount) * 100) : 0;

  const handleToggleScheduledAttendance = async (employeeId: string, branchName: string) => {
    if (!scheduleData || !scheduleData.branchAssignments) return;
    const branchIdx = scheduleData.branchAssignments.findIndex(b => b.branchName === branchName);
    if (branchIdx === -1) return;
    const empIdx = scheduleData.branchAssignments[branchIdx].employees.findIndex(e => e.employeeId === employeeId);
    if (empIdx === -1) return;
    const updatedBranchAssignments = scheduleData.branchAssignments.map((b, bIdx) =>
      bIdx === branchIdx
        ? { ...b, employees: b.employees.map((e, eIdx) => eIdx === empIdx ? { ...e, isPresent: !e.isPresent } : e) }
        : b
    );
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
      const todayISO = new Date().toISOString().split("T")[0]
      const emp = updatedBranchAssignments[branchIdx].employees[empIdx]
      await saveAttendanceRecord({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName || "Unknown",
        date: todayISO,
        status: emp.isPresent ? "present" : "absent",
        branchName,
      })
      const [schedules, attendanceRes] = await Promise.all([
        getSchedulesForDate(scheduleData.date),
        fetch(`/api/attendance?date=${todayISO}`).then(r => r.ok ? r.json() : []),
      ]);
      const updated = schedules.find((s: any) => s.id === scheduleData.id);
      if (updated) {
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
              return { ...e, isPresent: attendanceStatus === "present" || attendanceStatus === "undertime", attendanceStatus: attendanceStatus || null }
            }),
          }))
        }
        setScheduleData(updated);
      }
      showNotification("success", "Updated", "Attendance status updated.");
    } catch (err) {
      console.error("Toggle scheduled attendance error:", err);
      showNotification("error", "Update Failed", "Could not update attendance.");
    }
  }

  // Build flat list of all employees with branch info, apply search + status filter
  const getFilteredEmployees = () => {
    let list = [...uniqueScheduledEmployees]

    // Search filter
    const query = searchQuery.toLowerCase()
    if (query) {
      list = list.filter(e => (e.employeeName || "").toLowerCase().includes(query) || (e.branchName || "").toLowerCase().includes(query) || ((e as any).employeeCode || "").toLowerCase().includes(query))
    }

    // Status filter
    if (statusFilter === "present") {
      list = list.filter(e => e.isPresent && (e as any).attendanceStatus !== "undertime")
    } else if (statusFilter === "absent") {
      list = list.filter(e => !e.isPresent)
    } else if (statusFilter === "undertime") {
      list = list.filter(e => (e as any).attendanceStatus === "undertime")
    }

    // Sort: present first, then undertime, then absent
    list.sort((a, b) => {
      const statusOrder = (e: typeof a) => (e as any).attendanceStatus === "undertime" ? 1 : e.isPresent ? 0 : 2
      return statusOrder(a) - statusOrder(b)
    })

    return list
  }

  const filteredEmployees = getFilteredEmployees()
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedEmployees = filteredEmployees.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  // Filter leaves to current week (Mon-Sun)
  const weeklyLeaves = (() => {
    const now = new Date()
    const mon = getMonday(now)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    sun.setHours(23,59,59,999)
    const monISO = mon.toISOString().split("T")[0]
    const sunISO = sun.toISOString().split("T")[0]
    return approvedLeaves.filter((l: any) => {
      const start = l.startDate || ""
      const end = l.endDate || start
      return end >= monISO && start <= sunISO
    })
  })()

  const today = new Date()
  const greeting = today.getHours() < 12 ? "Good morning" : today.getHours() < 18 ? "Good afternoon" : "Good evening"
  const todayFormatted = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  const firstName = currentUser?.firstName || currentUser?.name?.split(" ")[0] || "Admin"

  const quickActions = [
    { label: "Employees", icon: Users, path: "/dashboard/employees", color: "bg-blue-500", description: "View & manage" },
    { label: "Schedule", icon: Calendar, path: "/dashboard/scheduling", color: "bg-violet-500", description: "Assign shifts" },
    { label: "Register", icon: UserPlus, path: "/dashboard/registration", color: "bg-emerald-500", description: "New employee" },
    { label: "Branches", icon: Building, path: "/dashboard/branches", color: "bg-orange-500", description: "Locations" },
    { label: "Leave", icon: FileText, path: "/dashboard/leave-approvals", color: "bg-rose-500", badge: weeklyLeaves.length, description: "Approvals" },
    { label: "Reports", icon: BarChart, path: "/dashboard/reports", color: "bg-cyan-500", description: "Analytics" },
  ]

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="h-8 w-64 bg-muted animate-pulse rounded-lg" />
          <div className="h-5 w-48 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {greeting}, {firstName}!
        </h1>
        <p className="text-muted-foreground mt-0.5">{todayFormatted}</p>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.path}
              onClick={() => router.push(action.path)}
              className="group relative flex flex-col items-center gap-2 p-4 rounded-xl bg-white dark:bg-gray-900 border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
            >
              <div className={`${action.color} h-10 w-10 rounded-lg flex items-center justify-center shadow-sm`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium">{action.label}</div>
                <div className="text-[11px] text-muted-foreground hidden sm:block">{action.description}</div>
              </div>
              {(action.badge ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white px-1">
                  {action.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Present (includes undertime) */}
        <Card className="border-l-4 border-l-green-500 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === "present" ? "all" : "present")}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{presentCount + undertimeCount}</div>
              <div className="text-sm text-muted-foreground">Present</div>
            </div>
          </CardContent>
        </Card>

        {/* Undertime */}
        <Card className="border-l-4 border-l-amber-500 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === "undertime" ? "all" : "undertime")}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{undertimeCount}</div>
              <div className="text-sm text-muted-foreground">Undertime</div>
            </div>
          </CardContent>
        </Card>

        {/* Absent */}
        <Card className="border-l-4 border-l-red-500 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === "absent" ? "all" : "absent")}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{absentCount}</div>
              <div className="text-sm text-muted-foreground">Absent</div>
            </div>
          </CardContent>
        </Card>

        {/* Total Scheduled */}
        <Card className="border-l-4 border-l-blue-500 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("all")}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalCount}</div>
              <div className="text-sm text-muted-foreground">
                Total Scheduled
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">Today&apos;s Attendance</CardTitle>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setCurrentPage(1) }}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({totalCount})</SelectItem>
                <SelectItem value="present">Present ({presentCount})</SelectItem>
                <SelectItem value="absent">Absent ({absentCount})</SelectItem>
                <SelectItem value="undertime">Undertime ({undertimeCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative mt-2 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or branch..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredEmployees.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEmployees.map((emp, index) => {
                    const status = (emp as any).attendanceStatus === "undertime" ? "undertime" : emp.isPresent ? "present" : "absent"
                    return (
                      <TableRow key={emp.employeeId}>
                        <TableCell className="text-muted-foreground">{(safePage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{(emp as any).employeeCode || "\u2014"}</TableCell>
                        <TableCell className="font-medium">{emp.employeeName}</TableCell>
                        <TableCell className="text-muted-foreground">{emp.branchName}</TableCell>
                        <TableCell>
                          <Badge
                            variant={status === "present" ? "default" : status === "absent" ? "destructive" : "outline"}
                            className={status === "undertime" ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800" : ""}
                          >
                            {status === "undertime" ? "Undertime" : status === "present" ? "Present" : "Absent"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={emp.isPresent ? "outline" : "default"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleToggleScheduledAttendance(emp.employeeId, emp.branchName || "")}
                          >
                            Mark {emp.isPresent ? "Absent" : "Present"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, filteredEmployees.length)} of {filteredEmployees.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8" disabled={safePage <= 1} onClick={() => setCurrentPage(safePage - 1)}>
                    Previous
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | string)[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...")
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) =>
                      typeof p === "string" ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">…</span>
                      ) : (
                        <Button key={p} variant={p === safePage ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p)}>
                          {p}
                        </Button>
                      )
                    )}
                  <Button variant="outline" size="sm" className="h-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage(safePage + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="py-12 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">
                {searchQuery || statusFilter !== "all"
                  ? "No employees match your filters"
                  : "No schedule for today"}
              </p>
              {!searchQuery && statusFilter === "all" && (
                <>
                  <p className="text-sm text-muted-foreground mt-1">Go to Scheduling to create today&apos;s crew assignments.</p>
                  <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/scheduling")}>
                    <Calendar className="h-4 w-4 mr-2" /> Open Scheduling
                  </Button>
                </>
              )}
              {(searchQuery || statusFilter !== "all") && (
                <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setCurrentPage(1) }}>
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-500" />
            Leave (This Week)
            {weeklyLeaves.length > 0 && <Badge variant="secondary">{weeklyLeaves.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {weeklyLeaves.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyLeaves.map((leave: any, index: number) => (
                    <TableRow key={leave.id || index}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{leave.employeeName || "Unknown"}</TableCell>
                      <TableCell className="capitalize">{leave.type || "—"}</TableCell>
                      <TableCell>{leave.startDate || "—"}</TableCell>
                      <TableCell>{leave.endDate || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={leave.status === "approved" ? "default" : "secondary"} className={leave.status === "approved" ? "bg-green-100 text-green-700 border-green-300" : "bg-yellow-100 text-yellow-700 border-yellow-300"}>
                          {leave.status === "approved" ? "Approved" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{leave.reason || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No leave records
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Absences Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Today&apos;s Reported Absences
            {todayAbsences.length > 0 && <Badge variant="secondary">{todayAbsences.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {todayAbsences.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayAbsences.map((absence: any, index: number) => (
                    <TableRow key={absence.id || index}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{absence.employeeName || "Unknown"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{absence.reason || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={absence.status === "excused" ? "default" : "destructive"}>
                          {absence.status === "excused" ? "Excused" : "Unexcused"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No absences reported today
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


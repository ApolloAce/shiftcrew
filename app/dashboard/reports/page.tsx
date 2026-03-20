"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { getActiveEmployees } from "@/lib/firestore-employee-service"
import { getAllBranches } from "@/lib/firestore-branch-service"
import { getAttendanceForDateRange } from "@/lib/firestore-attendance-service"
import { getAllLeaveRequests } from "@/lib/firestore-leave-service"
import { Chart, ChartContainer } from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Users, CheckCircle, XCircle, Clock, Calendar, Building, FileText, ChevronLeft, ChevronRight, TrendingUp, BarChart3 } from "lucide-react"
import { format } from "date-fns"

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getDateString(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getScheduledEmployeesFromSchedule(schedule: any) {
  const rows: Array<{ employeeId: string; employeeName?: string; branchName: string }> = []
  if (schedule?.branchAssignments?.length) {
    for (const branch of schedule.branchAssignments) {
      for (const emp of branch.employees || []) {
        rows.push({ employeeId: String(emp.employeeId), employeeName: emp.employeeName, branchName: branch.branchName || "Unassigned" })
      }
    }
    return rows
  }
  if (schedule?.assignments?.length) {
    for (const emp of schedule.assignments) {
      rows.push({ employeeId: String(emp.employeeId), employeeName: emp.employeeName, branchName: emp.branchName || "Unassigned" })
    }
  }
  return rows
}

export default function ReportsPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("attendance")
  const [timeRange, setTimeRange] = useState<"day" | "week" | "month">("day")
  const [leaveRequests, setLeaveRequests] = useState<any[]>([])
  const [weekSchedules, setWeekSchedules] = useState<any[]>([])
  const [weekAttendance, setWeekAttendance] = useState<any[]>([])
  const [trendSchedules, setTrendSchedules] = useState<any[]>([])
  const [trendAttendance, setTrendAttendance] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | "present" | "absent" | "undertime">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 15
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => getMonday(new Date()))

  // Fetch base data — each independently so one failure doesn't cascade
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try { setEmployees(await getActiveEmployees()) } catch (e) { console.error("Reports: Error fetching employees:", e) }
      try { setBranches(await getAllBranches()) } catch (e) { console.error("Reports: Error fetching branches:", e) }
      try { setLeaveRequests(await getAllLeaveRequests()) } catch (e) { console.error("Reports: Error fetching leaves:", e) }
      setIsLoading(false)
    }
    fetchData()
  }, [])

  // Fetch weekly schedules + attendance independently
  useEffect(() => {
    const fetchWeekData = async () => {
      const weekEnd = new Date(weekStartDate)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const startStr = getDateString(weekStartDate)
      const endStr = getDateString(weekEnd)

      // Fetch schedules
      try {
        const res = await fetch(`/api/schedules?weekStart=${startStr}`)
        if (res.ok) {
          const schedulesRes = await res.json()
          const byDate: Record<string, any> = {}
          for (const s of schedulesRes) {
            const d = s.scheduleFor || s.date
            const existing = byDate[d]
            if (!existing || new Date(s.updatedAt || s.createdAt || 0) > new Date(existing.updatedAt || existing.createdAt || 0)) {
              byDate[d] = s
            }
          }
          setWeekSchedules(Object.values(byDate))
        } else {
          setWeekSchedules([])
        }
      } catch (e) {
        console.warn("Error fetching week schedules:", e)
        setWeekSchedules([])
      }

      // Fetch attendance
      try {
        setWeekAttendance(await getAttendanceForDateRange(startStr, endStr))
      } catch (e) {
        console.warn("Error fetching week attendance:", e)
        setWeekAttendance([])
      }
    }
    fetchWeekData()
  }, [weekStartDate])

  // Fetch trend data independently
  useEffect(() => {
    const fetchTrendData = async () => {
      let rangeStart = new Date(weekStartDate)
      let rangeEnd = new Date(weekStartDate)
      rangeEnd.setDate(rangeEnd.getDate() + 6)

      if (timeRange === "week") {
        rangeStart = new Date(weekStartDate)
        rangeStart.setDate(rangeStart.getDate() - 21)
      } else if (timeRange === "month") {
        rangeStart = new Date(weekStartDate.getFullYear(), 0, 1)
        rangeEnd = new Date(weekStartDate.getFullYear(), 11, 31)
      }

      const startStr = getDateString(rangeStart)
      const endStr = getDateString(rangeEnd)

      // Fetch trend schedules
      try {
        const res = await fetch(`/api/schedules?startDate=${startStr}&endDate=${endStr}`)
        if (res.ok) setTrendSchedules(await res.json())
        else setTrendSchedules([])
      } catch (e) {
        console.warn("Error fetching trend schedules:", e)
        setTrendSchedules([])
      }

      // Fetch trend attendance
      try {
        setTrendAttendance(await getAttendanceForDateRange(startStr, endStr))
      } catch (e) {
        console.warn("Error fetching trend attendance:", e)
        setTrendAttendance([])
      }
    }
    fetchTrendData()
  }, [timeRange, weekStartDate])

  // Attendance lookup maps
  const attendanceLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    for (const rec of weekAttendance) {
      const dateStr = typeof rec.date === "string" && rec.date.includes("T") ? rec.date.split("T")[0] : rec.date
      lookup[`${rec.employeeId}_${dateStr}`] = rec.status
    }
    return lookup
  }, [weekAttendance])

  const trendAttendanceLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    for (const rec of trendAttendance) {
      const dateStr = typeof rec.date === "string" && rec.date.includes("T") ? rec.date.split("T")[0] : rec.date
      lookup[`${rec.employeeId}_${dateStr}`] = rec.status
    }
    return lookup
  }, [trendAttendance])

  // Employee attendance rows for the week
  const attendanceHistory = useMemo(() => {
    const employeeAtt: Record<string, { present: number; undertime: number; total: number; branchName: string; employeeName?: string }> = {}

    weekSchedules.forEach((schedule: any) => {
      const scheduleDate = schedule?.scheduleFor || schedule?.date
      if (!scheduleDate) return
      const scheduledEmps = getScheduledEmployeesFromSchedule(schedule)
      const seen = new Set<string>()

      scheduledEmps.forEach((emp) => {
        const key = `${emp.employeeId}_${scheduleDate}`
        if (seen.has(key)) return
        seen.add(key)

        if (!employeeAtt[emp.employeeId]) {
          employeeAtt[emp.employeeId] = { present: 0, undertime: 0, total: 0, branchName: emp.branchName, employeeName: emp.employeeName }
        }
        employeeAtt[emp.employeeId].total++
        employeeAtt[emp.employeeId].branchName = emp.branchName || employeeAtt[emp.employeeId].branchName
        if (emp.employeeName) employeeAtt[emp.employeeId].employeeName = emp.employeeName

        const status = attendanceLookup[`${emp.employeeId}_${scheduleDate}`]
        if (status === "present") employeeAtt[emp.employeeId].present++
        else if (status === "undertime") employeeAtt[emp.employeeId].undertime++
      })
    })

    return Object.entries(employeeAtt)
      .filter(([employeeId, att]) => {
        if (att.total <= 0) return false
        const crew = employees.find((c: any) => String(c.id) === String(employeeId))
        if (crew?.archived) return false
        return true
      })
      .map(([employeeId, att]) => {
        const crew = employees.find((c: any) => String(c.id) === String(employeeId))
        const displayName = crew
          ? `${crew.firstName || ""} ${crew.surname || ""}`.trim() || att.employeeName || `Employee ${employeeId}`
          : att.employeeName || `Employee ${employeeId}`
        const employeeCode = crew?.employeeCode || ""
        return {
          id: employeeId,
          displayName,
          employeeCode,
          branchName: att.branchName,
          presentDays: att.present + att.undertime,
          undertimeDays: att.undertime,
          totalDays: att.total,
          absentDays: att.total - att.present - att.undertime,
          wasPresent: att.present > 0 || att.undertime > 0,
          hasUndertime: att.undertime > 0,
        }
      })
      .sort((a, b) => {
        if (a.wasPresent !== b.wasPresent) return Number(b.wasPresent) - Number(a.wasPresent)
        return a.displayName.localeCompare(b.displayName)
      })
  }, [weekSchedules, weekAttendance, attendanceLookup, employees])

  // Filter & paginate attendance
  const filteredAttendance = useMemo(() => {
    let list = attendanceHistory
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(e => e.displayName.toLowerCase().includes(q) || e.branchName.toLowerCase().includes(q) || (e.employeeCode || "").toLowerCase().includes(q))
    }
    if (attendanceFilter === "present") list = list.filter(e => e.wasPresent && !e.hasUndertime)
    else if (attendanceFilter === "absent") list = list.filter(e => !e.wasPresent)
    else if (attendanceFilter === "undertime") list = list.filter(e => e.hasUndertime)
    return list
  }, [attendanceHistory, searchQuery, attendanceFilter])

  const totalPages = Math.max(1, Math.ceil(filteredAttendance.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedAttendance = filteredAttendance.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  // Summary stats
  const summary = useMemo(() => {
    const present = attendanceHistory.filter(e => e.wasPresent && !e.hasUndertime).length
    const undertime = attendanceHistory.filter(e => e.hasUndertime).length
    const total = attendanceHistory.length
    const absent = total - present - undertime
    const rate = total > 0 ? Math.round(((present + undertime) / total) * 100) : 0
    return { present, undertime, absent, total, rate }
  }, [attendanceHistory])

  // Branch allocation
  const branchAllocation = useMemo(() => {
    const map = new Map<string, { fullTime: number; partTime: number; total: number; present: number }>()
    branches.forEach(b => map.set(b.branchName, { fullTime: 0, partTime: 0, total: 0, present: 0 }))

    weekSchedules.forEach((schedule: any) => {
      const scheduleDate = schedule?.scheduleFor || schedule?.date
      if (!scheduleDate) return
      const rows = getScheduledEmployeesFromSchedule(schedule)
      const seen = new Set<string>()
      rows.forEach(emp => {
        const key = `${emp.employeeId}_${emp.branchName}_${scheduleDate}`
        if (seen.has(key)) return
        seen.add(key)
        const branchName = emp.branchName || "Unassigned"
        if (!map.has(branchName)) map.set(branchName, { fullTime: 0, partTime: 0, total: 0, present: 0 })
        const d = map.get(branchName)!
        const crew = employees.find((c: any) => String(c.id) === emp.employeeId)
        if (crew?.type === "full-time") d.fullTime++
        else if (crew?.type === "part-time") d.partTime++
        d.total++
        const status = attendanceLookup[`${emp.employeeId}_${scheduleDate}`]
        if (status === "present" || status === "undertime") d.present++
      })
    })

    return Array.from(map.entries()).map(([name, d]) => ({
      branchName: name,
      fullTime: d.fullTime,
      partTime: d.partTime,
      total: d.total,
      attendanceRate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0,
    }))
  }, [weekSchedules, weekAttendance, attendanceLookup, employees, branches])

  // Attendance trend chart data
  const trendChartData = useMemo(() => {
    if (timeRange === "day") {
      const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      const present: number[] = []
      const absent: number[] = []
      const undertime: number[] = []

      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStartDate)
        d.setDate(d.getDate() + i)
        const iso = getDateString(d)
        const schedule = weekSchedules.find((s: any) => (s.scheduleFor || s.date) === iso)
        if (schedule) {
          let p = 0, a = 0, u = 0
          getScheduledEmployeesFromSchedule(schedule).forEach((emp: any) => {
            const s = attendanceLookup[`${emp.employeeId}_${iso}`]
            if (s === "present") p++
            else if (s === "undertime") u++
            else a++
          })
          present.push(p); absent.push(a); undertime.push(u)
        } else {
          present.push(0); absent.push(0); undertime.push(0)
        }
      }

      return {
        labels,
        datasets: [
          { label: "Present", data: present, backgroundColor: "rgba(34, 197, 94, 0.6)", borderColor: "rgba(34, 197, 94, 1)", borderWidth: 1 },
          { label: "Undertime", data: undertime, backgroundColor: "rgba(245, 158, 11, 0.6)", borderColor: "rgba(245, 158, 11, 1)", borderWidth: 1 },
          { label: "Absent", data: absent, backgroundColor: "rgba(239, 68, 68, 0.6)", borderColor: "rgba(239, 68, 68, 1)", borderWidth: 1 },
        ],
      }
    }

    if (timeRange === "week") {
      const weeksMap = new Map<string, { label: string; present: number; absent: number; undertime: number; date: Date }>()

      trendSchedules.forEach((schedule: any) => {
        const dateStr = schedule?.scheduleFor || schedule?.date
        if (!dateStr) return
        const d = new Date(dateStr + "T00:00:00")
        const ws = getMonday(d)
        const label = `Week ${format(ws, "w")} (${format(ws, "MMM d")})`
        if (!weeksMap.has(label)) weeksMap.set(label, { label, present: 0, absent: 0, undertime: 0, date: ws })
        const wd = weeksMap.get(label)!
        getScheduledEmployeesFromSchedule(schedule).forEach((emp: any) => {
          const s = trendAttendanceLookup[`${emp.employeeId}_${dateStr}`]
          if (s === "present") wd.present++
          else if (s === "undertime") wd.undertime++
          else wd.absent++
        })
      })

      const sorted = Array.from(weeksMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(-4)
      return {
        labels: sorted.map(w => w.label),
        datasets: [
          { label: "Present", data: sorted.map(w => w.present), backgroundColor: "rgba(34, 197, 94, 0.6)", borderColor: "rgba(34, 197, 94, 1)", borderWidth: 1 },
          { label: "Undertime", data: sorted.map(w => w.undertime), backgroundColor: "rgba(245, 158, 11, 0.6)", borderColor: "rgba(245, 158, 11, 1)", borderWidth: 1 },
          { label: "Absent", data: sorted.map(w => w.absent), backgroundColor: "rgba(239, 68, 68, 0.6)", borderColor: "rgba(239, 68, 68, 1)", borderWidth: 1 },
        ],
      }
    }

    // Monthly
    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const mp = new Array(12).fill(0)
    const ma = new Array(12).fill(0)
    const mu = new Array(12).fill(0)

    trendSchedules.forEach((schedule: any) => {
      const dateStr = schedule?.scheduleFor || schedule?.date
      if (!dateStr) return
      const month = new Date(dateStr + "T00:00:00").getMonth()
      getScheduledEmployeesFromSchedule(schedule).forEach((emp: any) => {
        const s = trendAttendanceLookup[`${emp.employeeId}_${dateStr}`]
        if (s === "present") mp[month]++
        else if (s === "undertime") mu[month]++
        else ma[month]++
      })
    })

    return {
      labels,
      datasets: [
        { label: "Present", data: mp, backgroundColor: "rgba(34, 197, 94, 0.6)", borderColor: "rgba(34, 197, 94, 1)", borderWidth: 1 },
        { label: "Undertime", data: mu, backgroundColor: "rgba(245, 158, 11, 0.6)", borderColor: "rgba(245, 158, 11, 1)", borderWidth: 1 },
        { label: "Absent", data: ma, backgroundColor: "rgba(239, 68, 68, 0.6)", borderColor: "rgba(239, 68, 68, 1)", borderWidth: 1 },
      ],
    }
  }, [timeRange, weekSchedules, weekStartDate, attendanceLookup, trendSchedules, trendAttendanceLookup])

  // Leave summary
  const leaveSummary = useMemo(() => {
    let approved = 0, pending = 0, rejected = 0
    leaveRequests.forEach((l: any) => {
      if (l.status === "approved") approved++
      else if (l.status === "pending") pending++
      else if (l.status === "rejected") rejected++
    })
    return { approved, pending, rejected, total: approved + pending + rejected }
  }, [leaveRequests])

  // Leave trend chart
  const [leavePeriod, setLeavePeriod] = useState<"monthly" | "weekly" | "annually">("monthly")

  const leaveTrendData = useMemo(() => {
    const approved = leaveRequests.filter((l: any) => l.status === "approved")

    if (leavePeriod === "monthly") {
      const counts = new Array(12).fill(0)
      approved.forEach((l: any) => {
        const d = new Date(l.startDate)
        if (!isNaN(d.getTime())) counts[d.getMonth()]++
      })
      return {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        datasets: [{ label: "Approved Leaves", data: counts, backgroundColor: "rgba(59, 130, 246, 0.7)", borderColor: "rgba(59, 130, 246, 1)", borderWidth: 1 }],
      }
    }

    if (leavePeriod === "weekly") {
      const counts = new Array(5).fill(0)
      approved.forEach((l: any) => {
        const d = new Date(l.startDate)
        if (!isNaN(d.getTime())) {
          const week = Math.min(Math.floor((d.getDate() - 1) / 7), 4)
          counts[week]++
        }
      })
      return {
        labels: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"],
        datasets: [{ label: "Approved Leaves", data: counts, backgroundColor: "rgba(34, 197, 94, 0.7)", borderColor: "rgba(34, 197, 94, 1)", borderWidth: 1 }],
      }
    }

    const year = new Date().getFullYear()
    const labels = [year - 3, year - 2, year - 1, year].map(String)
    const counts = new Array(4).fill(0)
    approved.forEach((l: any) => {
      const d = new Date(l.startDate)
      if (!isNaN(d.getTime())) {
        const idx = d.getFullYear() - (year - 3)
        if (idx >= 0 && idx < 4) counts[idx]++
      }
    })
    return {
      labels,
      datasets: [{ label: "Approved Leaves", data: counts, backgroundColor: "rgba(168, 85, 247, 0.7)", borderColor: "rgba(168, 85, 247, 1)", borderWidth: 1 }],
    }
  }, [leaveRequests, leavePeriod])

  // Leave table data
  const [leaveFilter, setLeaveFilter] = useState<"all" | "approved" | "pending" | "rejected">("all")
  const [leaveSearch, setLeaveSearch] = useState("")
  const [leavePage, setLeavePage] = useState(1)

  const filteredLeaves = useMemo(() => {
    let list = leaveRequests
    if (leaveFilter !== "all") list = list.filter((l: any) => l.status === leaveFilter)
    if (leaveSearch) {
      const q = leaveSearch.toLowerCase()
      list = list.filter((l: any) => {
        const emp = employees.find((e: any) => String(e.id) === String(l.employeeId))
        return (l.employeeName || "").toLowerCase().includes(q) || (l.reason || "").toLowerCase().includes(q) || (emp?.employeeCode || "").toLowerCase().includes(q)
      })
    }
    return list.sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
  }, [leaveRequests, leaveFilter, leaveSearch])

  const leaveTotalPages = Math.max(1, Math.ceil(filteredLeaves.length / ITEMS_PER_PAGE))
  const leavePageSafe = Math.min(leavePage, leaveTotalPages)
  const paginatedLeaves = filteredLeaves.slice((leavePageSafe - 1) * ITEMS_PER_PAGE, leavePageSafe * ITEMS_PER_PAGE)

  // Week navigation
  const prevWeek = () => {
    const d = new Date(weekStartDate)
    d.setDate(d.getDate() - 7)
    setWeekStartDate(d)
    setCurrentPage(1)
  }
  const nextWeek = () => {
    const d = new Date(weekStartDate)
    d.setDate(d.getDate() + 7)
    setWeekStartDate(d)
    setCurrentPage(1)
  }
  const goToCurrentWeek = () => {
    setWeekStartDate(getMonday(new Date()))
    setCurrentPage(1)
  }

  const weekEnd = new Date(weekStartDate)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const isCurrentWeek = (() => {
    const today = new Date()
    return today >= weekStartDate && today <= weekEnd
  })()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  const PaginationControls = ({ current, total, setCurrent, count, perPage }: { current: number; total: number; setCurrent: (p: number) => void; count: number; perPage: number }) => {
    if (total <= 1) return null
    return (
      <div className="flex items-center justify-between border-t px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Showing {(current - 1) * perPage + 1}&ndash;{Math.min(current * perPage, count)} of {count}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8" disabled={current <= 1} onClick={() => setCurrent(current - 1)}>Previous</Button>
          {Array.from({ length: total }, (_, i) => i + 1)
            .filter(p => p === 1 || p === total || Math.abs(p - current) <= 1)
            .reduce<(number | string)[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...")
              acc.push(p)
              return acc
            }, [])
            .map((p, i) =>
              typeof p === "string" ? (
                <span key={`e-${i}`} className="px-1 text-muted-foreground">&hellip;</span>
              ) : (
                <Button key={p} variant={p === current ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setCurrent(p)}>{p}</Button>
              )
            )}
          <Button variant="outline" size="sm" className="h-8" disabled={current >= total} onClick={() => setCurrent(current + 1)}>Next</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">Attendance analytics, branch overview, and leave tracking</p>
        </div>
        {/* Week Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[180px]">
            <div className="text-sm font-medium">
              {format(weekStartDate, "MMM d")} &ndash; {format(weekEnd, "MMM d, yyyy")}
            </div>
            {isCurrentWeek && <Badge className="text-[10px] h-4 bg-blue-500">Current Week</Badge>}
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={goToCurrentWeek}>Today</Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{summary.present}</div>
              <div className="text-xs text-muted-foreground">Present</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{summary.undertime}</div>
              <div className="text-xs text-muted-foreground">Undertime</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{summary.absent}</div>
              <div className="text-xs text-muted-foreground">Absent</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total Scheduled</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{summary.rate}%</div>
              <div className="text-xs text-muted-foreground">Attendance Rate</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attendance" className="gap-1.5"><BarChart3 className="h-4 w-4 hidden sm:block" /> Attendance</TabsTrigger>
          <TabsTrigger value="branches" className="gap-1.5"><Building className="h-4 w-4 hidden sm:block" /> Branches</TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5"><FileText className="h-4 w-4 hidden sm:block" /> Leaves</TabsTrigger>
        </TabsList>

        {/* ─── ATTENDANCE TAB ─── */}
        <TabsContent value="attendance" className="space-y-6 mt-4">
          {/* Trend Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Attendance Trend</CardTitle>
                <Select value={timeRange} onValueChange={(v: "day" | "week" | "month") => setTimeRange(v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="week">Weekly</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer className="h-[260px]">
                <Chart
                  type="bar"
                  data={trendChartData}
                  options={{
                    responsive: true,
                    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
                    plugins: { legend: { position: "top" as const } },
                  }}
                />
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Attendance Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base">Employee Attendance Logs</CardTitle>
                <Select value={attendanceFilter} onValueChange={(v: any) => { setAttendanceFilter(v); setCurrentPage(1) }}>
                  <SelectTrigger className="w-[160px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="undertime">Undertime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative mt-2 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search name or branch..." className="pl-9 h-8 text-sm" value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {paginatedAttendance.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">#</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead>Employee ID</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead className="text-center">Days Present</TableHead>
                          <TableHead className="text-center">Total Days</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedAttendance.map((emp, i) => (
                          <TableRow key={emp.id}>
                            <TableCell className="text-muted-foreground">{(safePage - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                            <TableCell className="font-medium">{emp.displayName}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{emp.employeeCode || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{emp.branchName}</TableCell>
                            <TableCell className="text-center">
                              {emp.presentDays}
                              {emp.undertimeDays > 0 && <span className="text-amber-600 text-xs ml-1">({emp.undertimeDays} UT)</span>}
                            </TableCell>
                            <TableCell className="text-center">{emp.totalDays}</TableCell>
                            <TableCell>
                              {emp.hasUndertime ? (
                                <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800" variant="outline">Undertime</Badge>
                              ) : (
                                <Badge variant={emp.wasPresent ? "default" : "destructive"}>{emp.wasPresent ? "Present" : "Absent"}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationControls current={safePage} total={totalPages} setCurrent={setCurrentPage} count={filteredAttendance.length} perPage={ITEMS_PER_PAGE} />
                </>
              ) : (
                <div className="py-12 text-center">
                  <Calendar className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No attendance data for this week</p>
                  {(searchQuery || attendanceFilter !== "all") && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearchQuery(""); setAttendanceFilter("all"); setCurrentPage(1) }}>Clear Filters</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── BRANCHES TAB ─── */}
        <TabsContent value="branches" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Crew type distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Crew Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {employees.length > 0 ? (
                  <ChartContainer className="h-[260px]">
                    <Chart
                      type="pie"
                      data={{
                        labels: ["Full-Time", "Part-Time"],
                        datasets: [{
                          data: [
                            employees.filter(e => e.type === "full-time").length,
                            employees.filter(e => e.type === "part-time").length,
                          ],
                          backgroundColor: ["rgba(14, 165, 233, 0.7)", "rgba(139, 92, 246, 0.7)"],
                          borderColor: ["rgba(14, 165, 233, 1)", "rgba(139, 92, 246, 1)"],
                          borderWidth: 1,
                        }],
                      }}
                      options={{ responsive: true, plugins: { legend: { position: "bottom" as const } } }}
                    />
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">No data</div>
                )}
              </CardContent>
            </Card>

            {/* Branch deployment chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Building className="h-4 w-4" /> Branch Deployment</CardTitle>
              </CardHeader>
              <CardContent>
                {branchAllocation.some(a => a.total > 0) ? (
                  <ChartContainer className="h-[260px]">
                    <Chart
                      type="bar"
                      data={{
                        labels: branchAllocation.map(a => a.branchName),
                        datasets: [{ label: "Assigned Employees", data: branchAllocation.map(a => a.total), backgroundColor: "rgba(139, 92, 246, 0.6)", borderColor: "rgba(139, 92, 246, 1)", borderWidth: 1 }],
                      }}
                      options={{ responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: "top" as const } } }}
                    />
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">No deployment data</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Branch Allocation Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Crew Allocation by Branch</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-center">Full-Time</TableHead>
                      <TableHead className="text-center">Part-Time</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead>Attendance Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchAllocation.length > 0 ? branchAllocation.map(a => (
                      <TableRow key={a.branchName}>
                        <TableCell className="font-medium">{a.branchName}</TableCell>
                        <TableCell className="text-center">{a.fullTime}</TableCell>
                        <TableCell className="text-center">{a.partTime}</TableCell>
                        <TableCell className="text-center">{a.total}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm w-10">{a.attendanceRate}%</span>
                            <div className="flex-1 bg-muted rounded-full h-2 max-w-[120px]">
                              <div className={`h-2 rounded-full ${a.attendanceRate >= 75 ? "bg-green-500" : a.attendanceRate >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${a.attendanceRate}%` }} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No branch allocation data</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── LEAVES TAB ─── */}
        <TabsContent value="leaves" className="space-y-6 mt-4">
          {/* Leave Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-600">{leaveSummary.approved}</div>
                <p className="text-xs text-muted-foreground">Approved</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-amber-600">{leaveSummary.pending}</div>
                <p className="text-xs text-muted-foreground">Pending</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-red-600">{leaveSummary.rejected}</div>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </CardContent>
            </Card>
          </div>

          {/* Leave Trend Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Leave Trend</CardTitle>
                <Select value={leavePeriod} onValueChange={(v: "weekly" | "monthly" | "annually") => setLeavePeriod(v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer className="h-[260px]">
                <Chart
                  type="bar"
                  data={leaveTrendData}
                  options={{ responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: "top" as const } } }}
                />
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Leave Requests Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base">Leave Requests</CardTitle>
                <Select value={leaveFilter} onValueChange={(v: any) => { setLeaveFilter(v); setLeavePage(1) }}>
                  <SelectTrigger className="w-[160px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative mt-2 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search by name or reason..." className="pl-9 h-8 text-sm" value={leaveSearch}
                  onChange={(e) => { setLeaveSearch(e.target.value); setLeavePage(1) }} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {paginatedLeaves.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">#</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead>Employee ID</TableHead>
                          <TableHead>Date Range</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLeaves.map((leave: any, i: number) => {
                          const leaveEmp = employees.find((e: any) => String(e.id) === String(leave.employeeId))
                          return (
                          <TableRow key={leave.id || i}>
                            <TableCell className="text-muted-foreground">{(leavePageSafe - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                            <TableCell className="font-medium">{leave.employeeName || "Unknown"}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{leaveEmp?.employeeCode || "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {leave.startDate}{leave.endDate && leave.endDate !== leave.startDate ? ` \u2192 ${leave.endDate}` : ""}
                            </TableCell>
                            <TableCell className="text-sm">{leave.reason || "\u2014"}</TableCell>
                            <TableCell>
                              <Badge variant={leave.status === "approved" ? "default" : leave.status === "rejected" ? "destructive" : "outline"}
                                className={leave.status === "pending" ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400" : ""}>
                                {leave.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )})}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationControls current={leavePageSafe} total={leaveTotalPages} setCurrent={setLeavePage} count={filteredLeaves.length} perPage={ITEMS_PER_PAGE} />
                </>
              ) : (
                <div className="py-12 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No leave requests found</p>
                  {(leaveSearch || leaveFilter !== "all") && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLeaveSearch(""); setLeaveFilter("all"); setLeavePage(1) }}>Clear Filters</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

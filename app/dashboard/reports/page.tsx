"use client"

import React, { useState, useMemo, useEffect } from "react"
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
import { Search, Users, CheckCircle, XCircle, Clock, Calendar, Building, FileText, ChevronLeft, ChevronRight, TrendingUp, BarChart3, Download, ArrowUpDown, ShieldCheck, ChevronDown, Printer, Settings2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
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

// Diagnostic Error Boundary
class SafeSection extends React.Component<{name: string; children: React.ReactNode}, {error: any}> {
  constructor(props: any) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error: any) { return { error } }
  componentDidCatch(error: any, info: any) { console.error(`[ReportsPage] Error in "${(this as any).props.name}":`, error, info) }
  render() {
    if (this.state.error) return (
      <div className="p-4 m-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="font-bold text-red-800 dark:text-red-200">Error in: {this.props.name}</p>
        <p className="text-sm text-red-600 dark:text-red-300 mt-1">{String(this.state.error?.message || this.state.error)}</p>
      </div>
    )
    return this.props.children
  }
}

function ReportsPageInner() {
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
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | "present" | "absent" | "undertime" | "excused">("all")
  const [sortColumn, setSortColumn] = useState<string>("displayName")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
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
const employeeAtt: Record<string, { present: number; undertime: number; excused: number; total: number; branchName: string; employeeName?: string }> = {}

    weekSchedules.forEach((schedule: any) => {
      const scheduleDate = schedule?.scheduleFor || schedule?.date
      if (!scheduleDate) return
      if (new Date(scheduleDate + "T00:00:00").getDay() === 0) return // Skip Sundays
      const scheduledEmps = getScheduledEmployeesFromSchedule(schedule)
      const seen = new Set<string>()

      scheduledEmps.forEach((emp) => {
        const key = `${emp.employeeId}_${scheduleDate}`
        if (seen.has(key)) return
        seen.add(key)

        if (!employeeAtt[emp.employeeId]) {
          employeeAtt[emp.employeeId] = { present: 0, undertime: 0, excused: 0, total: 0, branchName: emp.branchName, employeeName: emp.employeeName }
        }
        employeeAtt[emp.employeeId].total++
        employeeAtt[emp.employeeId].branchName = emp.branchName || employeeAtt[emp.employeeId].branchName
        if (emp.employeeName) employeeAtt[emp.employeeId].employeeName = emp.employeeName

        const status = attendanceLookup[`${emp.employeeId}_${scheduleDate}`]
        if (status === "present" || status === "excused") employeeAtt[emp.employeeId].present++
        else if (status === "undertime") employeeAtt[emp.employeeId].undertime++
        if (status === "excused") employeeAtt[emp.employeeId].excused++
      })
    })

    return Object.entries(employeeAtt)
      .filter(([employeeId, att]) => {
        if (att.total <= 0) return false
        const crew = employees.find((c: any) => String(c.id) === String(employeeId))
        if (!crew) return false
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
          presentDays: att.present - att.excused,
          undertimeDays: att.undertime,
          excusedDays: att.excused,
          totalDays: att.total,
          absentDays: att.total - att.present - att.undertime,
          wasPresent: att.present > 0 || att.undertime > 0,
          hasUndertime: att.undertime > 0,
          hasExcused: att.excused > 0,
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
    else if (attendanceFilter === "excused") list = list.filter(e => e.hasExcused)
    list = [...list].sort((a, b) => {
      const valA = a[sortColumn as keyof typeof a]
      const valB = b[sortColumn as keyof typeof b]
      const cmp = typeof valA === "number" && typeof valB === "number" ? valA - valB : String(valA ?? "").localeCompare(String(valB ?? ""))
      return sortDirection === "asc" ? cmp : -cmp
    })
    return list
  }, [attendanceHistory, searchQuery, attendanceFilter, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(filteredAttendance.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedAttendance = filteredAttendance.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  // Summary stats
  const summary = useMemo(() => {
    const excused = attendanceHistory.filter(e => e.hasExcused).length
    const present = attendanceHistory.filter(e => e.wasPresent && !e.hasUndertime && !e.hasExcused).length
    const undertime = attendanceHistory.filter(e => e.hasUndertime).length
    const total = attendanceHistory.length
    const absent = total - present - undertime - excused
    const rate = total > 0 ? Math.round(((present + undertime + excused) / total) * 100) : 0
    return { present, undertime, excused, absent, total, rate }
  }, [attendanceHistory])

  // Branch allocation
  const branchAllocation = useMemo(() => {
    const map = new Map<string, { fullTime: number; partTime: number; total: number; present: number }>()
    branches.forEach(b => map.set(b.branchName, { fullTime: 0, partTime: 0, total: 0, present: 0 }))

    weekSchedules.forEach((schedule: any) => {
      const scheduleDate = schedule?.scheduleFor || schedule?.date
      if (!scheduleDate) return
      if (new Date(scheduleDate + "T00:00:00").getDay() === 0) return // Skip Sundays
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
        if (status === "present" || status === "undertime" || status === "excused") d.present++
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

  // ─── Print Dialog State (must be before any early returns to avoid hook order issues) ───
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printType, setPrintType] = useState<"attendance" | "branch" | "leave">("attendance")
  const [printFields, setPrintFields] = useState({
    employeeName: true,
    employeeId: true,
    branch: true,
    present: true,
    undertime: true,
    excused: true,
    absent: true,
    total: true,
    // branch report
    fullTime: true,
    partTime: true,
    attendanceRate: true,
    // leave report
    dateRange: true,
    reason: true,
    status: true,
    type: true,
  })
  const [printBranchFilter, setPrintBranchFilter] = useState<string>("all")
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

  // Sort handler
  const handleSort = (column: string) => {
    if (sortColumn === column) setSortDirection(d => d === "asc" ? "desc" : "asc")
    else { setSortColumn(column); setSortDirection("asc") }
  }

  const SortHeader = ({ column, children, className = "" }: { column: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 ${className}`} onClick={() => handleSort(column)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortColumn === column ? "text-primary" : "text-muted-foreground/50"}`} />
      </div>
    </TableHead>
  )

  // ─── Print Dialog helpers ───

  const togglePrintField = (field: string) => {
    setPrintFields(prev => ({ ...prev, [field]: !prev[field as keyof typeof prev] }))
  }

  // ─── Document styles (shared between PDF and Print) ───
  const docStyles = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;background:#fff}
    .hdr{display:flex;align-items:center;gap:16px;padding:18px 28px 16px;background:linear-gradient(135deg,#1a2e38 0%,#2d4a56 100%);color:#fff}
    .hdr img{width:64px;height:64px;object-fit:contain;border-radius:8px;background:rgba(255,255,255,0.15);padding:4px}
    .hdr .ht{flex:1} .hdr .sn{font-size:18px;font-weight:700;letter-spacing:.5px} .hdr .ss{font-size:10px;opacity:.85;margin-top:1px;line-height:1.4}
    .hdr .hr{text-align:right;font-size:10px;opacity:.85;line-height:1.6}
    .tb{background:#e8f0f3;border-bottom:2px solid #4d7e8f;padding:10px 28px;display:flex;justify-content:space-between;align-items:center}
    .tb .rt{font-size:13px;font-weight:700;color:#1a2e38} .tb .rm{font-size:10px;color:#555}
    .sm{display:flex;gap:10px;padding:12px 28px;background:#fafafa;border-bottom:1px solid #e5e7eb}
    .ch{flex:1;border-radius:6px;padding:8px 10px;text-align:center} .ch .v{font-size:18px;font-weight:700} .ch .l{font-size:9px;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
    .ch.cg{background:#dcfce7;color:#15803d} .ch.ca{background:#fef3c7;color:#b45309} .ch.ct{background:#d1fae5;color:#0f766e} .ch.cr{background:#fee2e2;color:#b91c1c} .ch.cy{background:#f3f4f6;color:#374151}
    .wp{padding:16px 28px 24px}
    table{width:100%;border-collapse:collapse;font-size:10.5px}
    thead tr{background:#1a2e38;color:#fff}
    thead th{padding:8px 10px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
    thead th.c{text-align:center}
    tbody tr:nth-child(even){background:#f8fafc} tbody tr:hover{background:#eff6ff}
    td{padding:7px 10px;border-bottom:1px solid #e9ecef}
    td.n{color:#9ca3af;width:32px} td.nm{font-weight:600} td.mono{font-family:'Courier New',monospace;font-size:10px;color:#6b7280}
    td.c{text-align:center} td.g{color:#15803d;font-weight:600} td.a{color:#b45309;font-weight:600} td.t{color:#0f766e;font-weight:600} td.r{color:#b91c1c;font-weight:600} td.b{font-weight:700}
    tr.totals-row td{padding:8px 10px;font-weight:700;background:#e8f0f3;border-top:2px solid #4d7e8f} tr.totals-row td.c{text-align:center}
    .sig{padding:40px 28px 20px;display:flex;justify-content:space-between;gap:40px}
    .sig .sb{flex:1;text-align:center} .sig .sl{border-top:1px solid #333;padding-top:6px;margin-top:40px;font-size:11px;font-weight:600}
    .ft{padding:10px 28px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
    @page{size:auto;margin:0}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact} .no-print{display:none!important}}
  `

  const docHeader = (title: string, dateRange: string, count: string) => {
    const generatedAt = format(new Date(), "MMMM d, yyyy h:mm a")
    return `<div class="hdr">
      <img src="data:image/png;base64,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" alt="Logo" />
      <div class="ht"><div class="sn">TAGPUAN NI KONSI</div><div class="ss">Home of Authentic<br/>Burger &amp; Siomai<br/>Brgy. Ipil 1 Silang, Cavite</div></div>
      <div class="hr"><div>${title}</div><div>${dateRange}</div></div>
    </div>
    <div class="tb"><span class="rt">${title}</span><span class="rm">Generated: ${generatedAt} | ${count}</span></div>`
  }

  const docSignature = `<div class="sig">
    <div class="sb"><div class="sl">Prepared by</div></div>
    <div class="sb"><div class="sl">Approved by</div></div>
  </div>`

  const docFooter = `<div class="ft"><span>TAGPUAN NI KONSI</span><span>Confidential \u2014 For Internal Use Only</span><span>${format(new Date(), "MMMM d, yyyy h:mm a")}</span></div>`

  // ─── Build attendance PDF/print content ───
  const buildAttendanceContent = (opts: { title: string; empList: typeof attendanceHistory; dateRange: string; fields?: typeof printFields }) => {
    const { title, empList, dateRange, fields } = opts
    const f = fields || printFields
    const headers: string[] = ["#"]
    if (f.employeeName) headers.push("Employee Name")
    if (f.employeeId) headers.push("Employee ID")
    if (f.branch) headers.push("Branch")
    if (f.present) headers.push("Present")
    if (f.undertime) headers.push("Undertime")
    if (f.excused) headers.push("Excused")
    if (f.absent) headers.push("Absent")
    if (f.total) headers.push("Total")
    const thRow = headers.map((h, i) => i >= 4 ? `<th class="c">${h}</th>` : `<th>${h}</th>`).join("")
    const rows = empList.map((emp, i) => {
      const cells: string[] = [`<td class="n">${i + 1}</td>`]
      if (f.employeeName) cells.push(`<td class="nm">${emp.displayName}</td>`)
      if (f.employeeId) cells.push(`<td class="mono">${emp.employeeCode || "\u2014"}</td>`)
      if (f.branch) cells.push(`<td>${emp.branchName}</td>`)
      if (f.present) cells.push(`<td class="c g">${emp.presentDays}</td>`)
      if (f.undertime) cells.push(`<td class="c a">${emp.undertimeDays}</td>`)
      if (f.excused) cells.push(`<td class="c t">${emp.excusedDays}</td>`)
      if (f.absent) cells.push(`<td class="c r">${emp.absentDays}</td>`)
      if (f.total) cells.push(`<td class="c b">${emp.totalDays}</td>`)
      return `<tr>${cells.join("")}</tr>`
    }).join("")
    const tP = empList.reduce((s, e) => s + e.presentDays, 0)
    const tU = empList.reduce((s, e) => s + e.undertimeDays, 0)
    const tE = empList.reduce((s, e) => s + e.excusedDays, 0)
    const tA = empList.reduce((s, e) => s + e.absentDays, 0)
    const tD = empList.reduce((s, e) => s + e.totalDays, 0)
    const colCount = headers.length
    const footCells: string[] = [`<td colspan="${Math.max(1, (f.employeeName ? 1 : 0) + (f.employeeId ? 1 : 0) + (f.branch ? 1 : 0) + 1)}"><strong>TOTALS</strong></td>`]
    if (f.present) footCells.push(`<td class="c g">${tP}</td>`)
    if (f.undertime) footCells.push(`<td class="c a">${tU}</td>`)
    if (f.excused) footCells.push(`<td class="c t">${tE}</td>`)
    if (f.absent) footCells.push(`<td class="c r">${tA}</td>`)
    if (f.total) footCells.push(`<td class="c b">${tD}</td>`)

    const summaryCards: string[] = []
    if (f.present) summaryCards.push(`<div class="ch cg"><div class="v">${tP}</div><div class="l">Present Days</div></div>`)
    if (f.undertime) summaryCards.push(`<div class="ch ca"><div class="v">${tU}</div><div class="l">Undertime Days</div></div>`)
    if (f.excused) summaryCards.push(`<div class="ch ct"><div class="v">${tE}</div><div class="l">Excused Days</div></div>`)
    if (f.absent) summaryCards.push(`<div class="ch cr"><div class="v">${tA}</div><div class="l">Absent Days</div></div>`)
    if (f.total) summaryCards.push(`<div class="ch cy"><div class="v">${tD}</div><div class="l">Total Scheduled</div></div>`)

    return `<style>${docStyles}</style>
    ${docHeader(title, dateRange, `${empList.length} employee(s)`)}
    <div class="wp">
      <table><thead><tr>${thRow}</tr></thead>
      <tbody>${rows}<tr class="totals-row">${footCells.join("")}</tr></tbody></table>
    </div>
    ${docSignature}
    ${docFooter}`
  }

  // ─── Build branch PDF/print content ───
  const buildBranchContent = (branchData: typeof branchAllocation, dateRange: string) => {
    const f = printFields
    const headers: string[] = ["#", "Branch Name"]
    if (f.fullTime) headers.push("Full-Time")
    if (f.partTime) headers.push("Part-Time")
    if (f.total) headers.push("Total")
    if (f.attendanceRate) headers.push("Attendance Rate")
    const thRow = headers.map((h, i) => i >= 2 ? `<th class="c">${h}</th>` : `<th>${h}</th>`).join("")
    const rows = branchData.map((b, i) => {
      const cells: string[] = [`<td class="n">${i + 1}</td>`, `<td class="nm">${b.branchName}</td>`]
      if (f.fullTime) cells.push(`<td class="c">${b.fullTime}</td>`)
      if (f.partTime) cells.push(`<td class="c">${b.partTime}</td>`)
      if (f.total) cells.push(`<td class="c b">${b.total}</td>`)
      if (f.attendanceRate) cells.push(`<td class="c ${b.attendanceRate >= 75 ? 'g' : b.attendanceRate >= 50 ? 'a' : 'r'}">${b.attendanceRate}%</td>`)
      return `<tr>${cells.join("")}</tr>`
    }).join("")
    const tFT = branchData.reduce((s, b) => s + b.fullTime, 0)
    const tPT = branchData.reduce((s, b) => s + b.partTime, 0)
    const tTotal = branchData.reduce((s, b) => s + b.total, 0)
    const avgRate = branchData.length > 0 ? Math.round(branchData.reduce((s, b) => s + b.attendanceRate, 0) / branchData.length) : 0
    const footCells: string[] = [`<td colspan="2"><strong>TOTALS</strong></td>`]
    if (f.fullTime) footCells.push(`<td class="c">${tFT}</td>`)
    if (f.partTime) footCells.push(`<td class="c">${tPT}</td>`)
    if (f.total) footCells.push(`<td class="c b">${tTotal}</td>`)
    if (f.attendanceRate) footCells.push(`<td class="c g">${avgRate}%</td>`)

    const summaryCards: string[] = []
    if (f.fullTime) summaryCards.push(`<div class="ch ca"><div class="v">${tFT}</div><div class="l">Full-Time</div></div>`)
    if (f.partTime) summaryCards.push(`<div class="ch ct"><div class="v">${tPT}</div><div class="l">Part-Time</div></div>`)
    if (f.total) summaryCards.push(`<div class="ch cy"><div class="v">${tTotal}</div><div class="l">Total Assigned</div></div>`)
    if (f.attendanceRate) summaryCards.push(`<div class="ch cg"><div class="v">${avgRate}%</div><div class="l">Avg Attendance</div></div>`)

    return `<style>${docStyles}</style>
    ${docHeader("Branch Allocation Report", dateRange, `${branchData.length} branch(es)`)}
    <div class="wp">
      <table><thead><tr>${thRow}</tr></thead>
      <tbody>${rows}<tr class="totals-row">${footCells.join("")}</tr></tbody></table>
    </div>
    ${docSignature}
    ${docFooter}`
  }

  // ─── Build leave PDF/print content ───
  const buildLeaveContent = (leaves: any[], dateRange: string) => {
    const f = printFields
    const headers: string[] = ["#", "Employee"]
    if (f.employeeId) headers.push("Employee ID")
    if (f.type) headers.push("Type")
    if (f.dateRange) headers.push("Date Range")
    if (f.reason) headers.push("Reason")
    if (f.status) headers.push("Status")
    const thRow = headers.map(h => `<th>${h}</th>`).join("")
    const rows = leaves.map((lv: any, i: number) => {
      const emp = employees.find((e: any) => String(e.id) === String(lv.employeeId))
      const cells: string[] = [`<td class="n">${i + 1}</td>`, `<td class="nm">${lv.employeeName || "Unknown"}</td>`]
      if (f.employeeId) cells.push(`<td class="mono">${emp?.employeeCode || "\u2014"}</td>`)
      if (f.type) cells.push(`<td style="text-transform:capitalize">${lv.type || "\u2014"}</td>`)
      if (f.dateRange) cells.push(`<td>${lv.startDate}${lv.endDate && lv.endDate !== lv.startDate ? " \u2192 " + lv.endDate : ""}</td>`)
      if (f.reason) cells.push(`<td>${lv.reason || "\u2014"}</td>`)
      if (f.status) {
        const color = lv.status === "approved" ? "g" : lv.status === "rejected" ? "r" : "a"
        cells.push(`<td class="${color}" style="text-transform:capitalize;font-weight:600">${lv.status}</td>`)
      }
      return `<tr>${cells.join("")}</tr>`
    }).join("")
    const approved = leaves.filter((l: any) => l.status === "approved").length
    const pending = leaves.filter((l: any) => l.status === "pending").length
    const rejected = leaves.filter((l: any) => l.status === "rejected").length

    return `<style>${docStyles}</style>
    ${docHeader("Leave Report", dateRange, `${leaves.length} request(s)`)}
    <div class="wp">
      <table><thead><tr>${thRow}</tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    ${docSignature}
    ${docFooter}`
  }

  // ─── Open print window (direct browser print) ───
  const openPrintWindow = (htmlContent: string, title: string) => {
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body style="margin:0;padding:0">
<div style="padding:10mm">
${htmlContent}
</div>
<script>setTimeout(function(){window.print()},300)<\/script></body></html>`)
    win.document.close()
  }

  // ─── Download PDF handler ───
  const handleDownloadPdf = (title: string, empList: typeof attendanceHistory, filename: string) => {
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 6)
    const dateRange = `${format(weekStartDate, "MMMM d")} \u2013 ${format(weekEndDate, "MMMM d, yyyy")}`
    const htmlContent = buildAttendanceContent({ title, empList, dateRange })
    const safeFilename = encodeURIComponent(filename)
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
</head><body style="margin:0;padding:0">
${htmlContent}
<script>
window.onload=function(){
  document.title='Generating PDF...';
  setTimeout(function(){
    html2pdf().set({
      margin:0,
      filename:decodeURIComponent('${safeFilename}'),
      image:{type:'jpeg',quality:0.98},
      html2canvas:{scale:2,useCORS:true,logging:false},
      jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}
    }).from(document.body).save().then(function(){
      document.title='PDF Downloaded!';
      setTimeout(function(){window.close();},2000);
    });
  },600);
};
<\/script></body></html>`)
    win.document.close()
  }

  // ─── Print attendance report ───
  const handlePrintAttendance = () => {
    setPrintType("attendance")
    setPrintDialogOpen(true)
  }

  // ─── Print branch report ───
  const handlePrintBranch = () => {
    setPrintType("branch")
    setPrintDialogOpen(true)
  }

  // ─── Print leave report ───
  const handlePrintLeave = () => {
    setPrintType("leave")
    setPrintDialogOpen(true)
  }

  const executePrint = () => {
    if (printType === "attendance") {
      // Determine data source and labels based on timeRange
      let schedules: any[]
      let lookup: Record<string, string>
      let title: string
      let dateRange: string

      if (timeRange === "day") {
        schedules = weekSchedules
        lookup = attendanceLookup
        const weekEndDate = new Date(weekStartDate)
        weekEndDate.setDate(weekEndDate.getDate() + 6)
        title = "Daily Attendance Summary"
        dateRange = `${format(weekStartDate, "MMMM d")} \u2013 ${format(weekEndDate, "MMMM d, yyyy")}`
      } else if (timeRange === "week") {
        schedules = trendSchedules
        lookup = trendAttendanceLookup
        const rangeStart = new Date(weekStartDate)
        rangeStart.setDate(rangeStart.getDate() - 21)
        const rangeEnd = new Date(weekStartDate)
        rangeEnd.setDate(rangeEnd.getDate() + 6)
        title = "Weekly Attendance Summary"
        dateRange = `${format(rangeStart, "MMMM d")} \u2013 ${format(rangeEnd, "MMMM d, yyyy")}`
      } else {
        schedules = trendSchedules
        lookup = trendAttendanceLookup
        title = "Monthly Attendance Summary"
        dateRange = `January \u2013 December ${weekStartDate.getFullYear()}`
      }

      // Build attendance history from the selected data source
      const employeeAtt: Record<string, { present: number; undertime: number; excused: number; total: number; branchName: string; employeeName?: string }> = {}
      schedules.forEach((schedule: any) => {
        const scheduleDate = schedule?.scheduleFor || schedule?.date
        if (!scheduleDate) return
        if (new Date(scheduleDate + "T00:00:00").getDay() === 0) return
        const scheduledEmps = getScheduledEmployeesFromSchedule(schedule)
        const seen = new Set<string>()
        scheduledEmps.forEach((emp) => {
          const key = `${emp.employeeId}_${scheduleDate}`
          if (seen.has(key)) return
          seen.add(key)
          if (!employeeAtt[emp.employeeId]) {
            employeeAtt[emp.employeeId] = { present: 0, undertime: 0, excused: 0, total: 0, branchName: emp.branchName, employeeName: emp.employeeName }
          }
          employeeAtt[emp.employeeId].total++
          employeeAtt[emp.employeeId].branchName = emp.branchName || employeeAtt[emp.employeeId].branchName
          if (emp.employeeName) employeeAtt[emp.employeeId].employeeName = emp.employeeName
          const status = lookup[`${emp.employeeId}_${scheduleDate}`]
          if (status === "present" || status === "excused") employeeAtt[emp.employeeId].present++
          else if (status === "undertime") employeeAtt[emp.employeeId].undertime++
          if (status === "excused") employeeAtt[emp.employeeId].excused++
        })
      })

      const empList = Object.entries(employeeAtt)
        .filter(([employeeId, att]) => {
          if (att.total <= 0) return false
          const crew = employees.find((c: any) => String(c.id) === String(employeeId))
          return crew && !crew.archived
        })
        .map(([employeeId, att]) => {
          const crew = employees.find((c: any) => String(c.id) === String(employeeId))
          const displayName = crew
            ? `${crew.firstName || ""} ${crew.surname || ""}`.trim() || att.employeeName || `Employee ${employeeId}`
            : att.employeeName || `Employee ${employeeId}`
          return {
            id: employeeId,
            displayName,
            employeeCode: crew?.employeeCode || "",
            branchName: att.branchName,
            presentDays: att.present - att.excused,
            undertimeDays: att.undertime,
            excusedDays: att.excused,
            totalDays: att.total,
            absentDays: att.total - att.present - att.undertime,
            wasPresent: att.present > 0 || att.undertime > 0,
            hasUndertime: att.undertime > 0,
            hasExcused: att.excused > 0,
          }
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName))

      const effectiveFields = timeRange === "day" ? printFields : { ...printFields, branch: false }
      const htmlContent = buildAttendanceContent({ title, empList, dateRange, fields: effectiveFields })
      openPrintWindow(htmlContent, title)
    } else if (printType === "branch") {
      let schedules: any[]
      let lookup: Record<string, string>
      let dateRange: string

      if (timeRange === "day") {
        schedules = weekSchedules
        lookup = attendanceLookup
        const weekEndDate = new Date(weekStartDate)
        weekEndDate.setDate(weekEndDate.getDate() + 6)
        dateRange = `${format(weekStartDate, "MMMM d")} \u2013 ${format(weekEndDate, "MMMM d, yyyy")}`
      } else if (timeRange === "week") {
        schedules = trendSchedules
        lookup = trendAttendanceLookup
        const rangeStart = new Date(weekStartDate)
        rangeStart.setDate(rangeStart.getDate() - 21)
        const rangeEnd = new Date(weekStartDate)
        rangeEnd.setDate(rangeEnd.getDate() + 6)
        dateRange = `${format(rangeStart, "MMMM d")} \u2013 ${format(rangeEnd, "MMMM d, yyyy")}`
      } else {
        schedules = trendSchedules
        lookup = trendAttendanceLookup
        dateRange = `January \u2013 December ${weekStartDate.getFullYear()}`
      }

      // Build branch allocation from the selected data source
      const map = new Map<string, { fullTime: number; partTime: number; total: number; present: number }>()
      branches.forEach(b => map.set(b.branchName, { fullTime: 0, partTime: 0, total: 0, present: 0 }))
      schedules.forEach((schedule: any) => {
        const scheduleDate = schedule?.scheduleFor || schedule?.date
        if (!scheduleDate) return
        if (new Date(scheduleDate + "T00:00:00").getDay() === 0) return
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
          const status = lookup[`${emp.employeeId}_${scheduleDate}`]
          if (status === "present" || status === "undertime" || status === "excused") d.present++
        })
      })
      const branchData = Array.from(map.entries()).map(([name, d]) => ({
        branchName: name,
        fullTime: d.fullTime,
        partTime: d.partTime,
        total: d.total,
        attendanceRate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0,
      }))

      const htmlContent = buildBranchContent(branchData, dateRange)
      openPrintWindow(htmlContent, "Branch Allocation Report")
    } else {
      // Filter leaves by leavePeriod
      const now = new Date()
      let periodLeaves = filteredLeaves
      let dateRange: string
      let title: string

      if (leavePeriod === "weekly") {
        const year = now.getFullYear()
        const month = now.getMonth()
        periodLeaves = filteredLeaves.filter((l: any) => {
          const d = new Date(l.startDate)
          return d.getFullYear() === year && d.getMonth() === month
        })
        title = "Leave Report (Weekly)"
        dateRange = format(now, "MMMM yyyy")
      } else if (leavePeriod === "annually") {
        const year = now.getFullYear()
        periodLeaves = filteredLeaves.filter((l: any) => {
          const d = new Date(l.startDate)
          const y = d.getFullYear()
          return y >= year - 3 && y <= year
        })
        title = "Leave Report (Annual)"
        dateRange = `${year - 3} \u2013 ${year}`
      } else {
        const year = now.getFullYear()
        periodLeaves = filteredLeaves.filter((l: any) => {
          const d = new Date(l.startDate)
          return d.getFullYear() === year
        })
        title = "Leave Report (Monthly)"
        dateRange = `January \u2013 December ${year}`
      }

      const htmlContent = buildLeaveContent(periodLeaves, dateRange)
      openPrintWindow(htmlContent, title)
    }
    setPrintDialogOpen(false)
  }

  // ─── Download leave PDF ───
  const handleDownloadLeavePdf = () => {
    const now = new Date()
    let periodLeaves = filteredLeaves
    let dateRange: string

    if (leavePeriod === "weekly") {
      periodLeaves = filteredLeaves.filter((l: any) => {
        const d = new Date(l.startDate)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })
      dateRange = format(now, "MMMM yyyy")
    } else if (leavePeriod === "annually") {
      const year = now.getFullYear()
      periodLeaves = filteredLeaves.filter((l: any) => {
        const d = new Date(l.startDate)
        const y = d.getFullYear()
        return y >= year - 3 && y <= year
      })
      dateRange = `${year - 3} \u2013 ${year}`
    } else {
      periodLeaves = filteredLeaves.filter((l: any) => {
        const d = new Date(l.startDate)
        return d.getFullYear() === now.getFullYear()
      })
      dateRange = `January \u2013 December ${now.getFullYear()}`
    }

    const htmlContent = buildLeaveContent(periodLeaves, dateRange)
    const filename = `Leave_Report_${format(new Date(), "MMMd_yyyy")}.pdf`
    const safeFilename = encodeURIComponent(filename)
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Leave Report</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
</head><body style="margin:0;padding:0">
${htmlContent}
<script>
window.onload=function(){
  document.title='Generating PDF...';
  setTimeout(function(){
    html2pdf().set({
      margin:0,
      filename:decodeURIComponent('${safeFilename}'),
      image:{type:'jpeg',quality:0.98},
      html2canvas:{scale:2,useCORS:true,logging:false},
      jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}
    }).from(document.body).save().then(function(){
      document.title='PDF Downloaded!';
      setTimeout(function(){window.close();},2000);
    });
  },600);
};
<\/script></body></html>`)
    win.document.close()
  }

  // ─── Branch PDF download ───
  const handleDownloadBranchPdf = (branchData: typeof branchAllocation, filename: string) => {
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 6)
    const dateRange = `${format(weekStartDate, "MMMM d")} \u2013 ${format(weekEndDate, "MMMM d, yyyy")}`
    const htmlContent = buildBranchContent(branchData, dateRange)
    const safeFilename = encodeURIComponent(filename)
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Branch Allocation Report</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
</head><body style="margin:0;padding:0">
${htmlContent}
<script>
window.onload=function(){
  document.title='Generating PDF...';
  setTimeout(function(){
    html2pdf().set({
      margin:0,
      filename:decodeURIComponent('${safeFilename}'),
      image:{type:'jpeg',quality:0.98},
      html2canvas:{scale:2,useCORS:true,logging:false},
      jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}
    }).from(document.body).save().then(function(){
      document.title='PDF Downloaded!';
      setTimeout(function(){window.close();},2000);
    });
  },600);
};
<\/script></body></html>`)
    win.document.close()
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{summary.excused}</div>
              <div className="text-xs text-muted-foreground">Excused</div>
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
          <SafeSection name="Attendance Tab">
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
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handlePrintAttendance}>
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        Download PDF
                        <ChevronDown className="h-3 w-3 ml-0.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        onClick={() => {
                          const we = new Date(weekStartDate)
                          we.setDate(we.getDate() + 6)
                          handleDownloadPdf("Weekly Attendance Summary", filteredAttendance, `Attendance_Report_${format(weekStartDate, "MMMd")}-${format(we, "MMMd_yyyy")}.pdf`)
                        }}
                      >
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Download All
                      </DropdownMenuItem>
                      {(() => {
                        const branchNames = [...new Set(attendanceHistory.map(e => e.branchName))].sort()
                        if (branchNames.length > 0) {
                          return (
                            <>
                              <DropdownMenuSeparator />
                              {branchNames.map(name => (
                                <DropdownMenuItem
                                  key={name}
                                  onClick={() => {
                                    const we = new Date(weekStartDate)
                                    we.setDate(we.getDate() + 6)
                                    const branchData = filteredAttendance.filter(e => e.branchName === name)
                                    handleDownloadPdf(`${name} — Attendance Summary`, branchData, `Attendance_${name.replace(/\s+/g, "_")}_${format(weekStartDate, "MMMd")}-${format(we, "MMMd_yyyy")}.pdf`)
                                  }}
                                >
                                  <Building className="h-3.5 w-3.5 mr-2" />
                                  Download {name}
                                </DropdownMenuItem>
                              ))}
                            </>
                          )
                        }
                        return null
                      })()}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Select value={attendanceFilter} onValueChange={(v: any) => { setAttendanceFilter(v); setCurrentPage(1) }}>
                    <SelectTrigger className="w-[160px] h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="undertime">Undertime</SelectItem>
                      <SelectItem value="excused">Excused</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                          <SortHeader column="displayName">Employee</SortHeader>
                          <SortHeader column="employeeCode">Employee ID</SortHeader>
                          <SortHeader column="branchName">Branch</SortHeader>
                          <SortHeader column="presentDays" className="text-center">Present</SortHeader>
                          <SortHeader column="undertimeDays" className="text-center">Undertime</SortHeader>
                          <SortHeader column="excusedDays" className="text-center">Excused</SortHeader>
                          <SortHeader column="absentDays" className="text-center">Absent</SortHeader>
                          <SortHeader column="totalDays" className="text-center">Total Days</SortHeader>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedAttendance.map((emp, i) => (
                          <TableRow key={emp.id}>
                            <TableCell className="text-muted-foreground">{(safePage - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                            <TableCell className="font-medium">{emp.displayName}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{emp.employeeCode || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{emp.branchName}</TableCell>
                            <TableCell className="text-center">{emp.presentDays}</TableCell>
                            <TableCell className="text-center">
                              {emp.undertimeDays > 0
                                ? <span className="text-amber-600 font-medium">{emp.undertimeDays}</span>
                                : <span className="text-muted-foreground">0</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              {emp.excusedDays > 0
                                ? <span className="text-green-600 font-medium">{emp.excusedDays}</span>
                                : <span className="text-muted-foreground">0</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              {emp.absentDays > 0
                                ? <span className="text-red-600 font-medium">{emp.absentDays}</span>
                                : <span className="text-muted-foreground">0</span>}
                            </TableCell>
                            <TableCell className="text-center">{emp.totalDays}</TableCell>
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
          </SafeSection>
        </TabsContent>

        {/* ─── BRANCHES TAB ─── */}
        <TabsContent value="branches" className="space-y-6 mt-4">
          <SafeSection name="Branches Tab">
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Crew Allocation by Branch</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handlePrintBranch}>
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => {
                      const we = new Date(weekStartDate)
                      we.setDate(we.getDate() + 6)
                      handleDownloadBranchPdf(branchAllocation, `Branch_Allocation_Report_${format(weekStartDate, "MMMd")}-${format(we, "MMMd_yyyy")}.pdf`)
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download All
                  </Button>
                </div>
              </div>
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
                      <TableHead className="text-center w-[80px]">Report</TableHead>
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
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title={`Download ${a.branchName} report`}
                            onClick={() => {
                              const branchEmps = attendanceHistory.filter(e => e.branchName === a.branchName)
                              const we = new Date(weekStartDate)
                              we.setDate(we.getDate() + 6)
                              const safeName = a.branchName.replace(/[^a-zA-Z0-9]/g, "_")
                              handleDownloadPdf(`${a.branchName} Attendance Report`, branchEmps, `${safeName}_Report_${format(weekStartDate, "MMMd")}-${format(we, "MMMd_yyyy")}.pdf`)
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No branch allocation data</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          </SafeSection>
        </TabsContent>

        {/* ─── LEAVES TAB ─── */}
        <TabsContent value="leaves" className="space-y-6 mt-4">
          <SafeSection name="Leaves Tab">
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
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handlePrintLeave}>
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleDownloadLeavePdf}>
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </Button>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLeaves.map((leave: any, i: number) => {
                          const leaveEmp = employees.find((e: any) => String(e.id) === String(leave.employeeId))
                          return (
                          <TableRow key={leave.id || i}>
                            <TableCell className="text-muted-foreground">{(leavePageSafe - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                            <TableCell className="font-medium">{String(leave.employeeName || "Unknown")}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{String(leaveEmp?.employeeCode || "—")}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {leave.startDate ? format(new Date(leave.startDate), "MMM d, yyyy") : "—"}{leave.endDate && String(leave.endDate) !== String(leave.startDate) ? ` → ${format(new Date(leave.endDate), "MMM d, yyyy")}` : ""}
                            </TableCell>
                            <TableCell className="text-sm">{String(leave.reason || "\u2014")}</TableCell>

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
          </SafeSection>
        </TabsContent>
      </Tabs>

      {/* Print Configuration Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Print Settings
            </DialogTitle>
            <DialogDescription>
              Select the columns to include in your {printType === "attendance" ? "Attendance" : printType === "branch" ? "Branch Allocation" : "Leave"} report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Include Columns</div>
            <div className="grid grid-cols-2 gap-3">
              {printType === "attendance" && (
                <>
                  {[
                    { key: "employeeName", label: "Employee Name" },
                    { key: "employeeId", label: "Employee ID" },
                    ...(timeRange === "day" ? [{ key: "branch", label: "Branch" }] : []),
                    { key: "present", label: "Present Days" },
                    { key: "undertime", label: "Undertime Days" },
                    { key: "excused", label: "Excused Days" },
                    { key: "absent", label: "Absent Days" },
                    { key: "total", label: "Total Days" },
                  ].map((col) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`print-${col.key}`}
                        checked={printFields[col.key as keyof typeof printFields]}
                        onCheckedChange={(checked) =>
                          setPrintFields((prev) => ({ ...prev, [col.key]: !!checked }))
                        }
                      />
                      <Label htmlFor={`print-${col.key}`} className="text-sm cursor-pointer">{col.label}</Label>
                    </div>
                  ))}
                </>
              )}
              {printType === "branch" && (
                <>
                  {[
                    { key: "fullTime", label: "Full-Time" },
                    { key: "partTime", label: "Part-Time" },
                    { key: "total", label: "Total" },
                    { key: "attendanceRate", label: "Attendance Rate" },
                  ].map((col) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`print-${col.key}`}
                        checked={printFields[col.key as keyof typeof printFields]}
                        onCheckedChange={(checked) =>
                          setPrintFields((prev) => ({ ...prev, [col.key]: !!checked }))
                        }
                      />
                      <Label htmlFor={`print-${col.key}`} className="text-sm cursor-pointer">{col.label}</Label>
                    </div>
                  ))}
                </>
              )}
              {printType === "leave" && (
                <>
                  {[
                    { key: "employeeId", label: "Employee ID" },
                    { key: "type", label: "Leave Type" },
                    { key: "dateRange", label: "Date Range" },
                    { key: "reason", label: "Reason" },
                    { key: "status", label: "Status" },
                  ].map((col) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`print-${col.key}`}
                        checked={printFields[col.key as keyof typeof printFields]}
                        onCheckedChange={(checked) =>
                          setPrintFields((prev) => ({ ...prev, [col.key]: !!checked }))
                        }
                      />
                      <Label htmlFor={`print-${col.key}`} className="text-sm cursor-pointer">{col.label}</Label>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const allTrue = printType === "attendance"
                  ? { employeeName: true, employeeId: true, branch: true, present: true, undertime: true, excused: true, absent: true, total: true }
                  : printType === "branch"
                  ? { fullTime: true, partTime: true, total: true, attendanceRate: true }
                  : { employeeId: true, type: true, dateRange: true, reason: true, status: true }
                setPrintFields((prev) => ({ ...prev, ...allTrue }))
              }}
            >
              Select All
            </Button>
            <Button onClick={executePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              Print Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

export default function ReportsPage() {
  return (
    <SafeSection name="Reports Page">
      <ReportsPageInner />
    </SafeSection>
  )
}

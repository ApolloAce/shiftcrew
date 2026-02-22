"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getActiveEmployees } from "@/lib/firestore-employee-service"
import { getAllBranches } from "@/lib/firestore-branch-service"
import { getSchedulesForDate } from "@/lib/firestore-schedule-service"
import { getAttendanceForDateRange } from "@/lib/firestore-attendance-service"
import { CheckCircle2, XCircle, BarChart2, Users, MapPin, Calendar } from "lucide-react"
import { Chart, ChartContainer } from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format, subDays, isWeekend, isToday, isBefore, startOfDay, subMonths } from "date-fns"
import { BasicDatePicker } from "@/components/ui/basic-date-picker"
import { getAllLeaveRequests } from "@/lib/firestore-leave-service"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ReportsPage() {
  const [branches, setBranches] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(today.setDate(diff))
  })
  const [activeTab, setActiveTab] = useState("attendance")
  const [timeRange, setTimeRange] = useState<"day" | "week" | "month">("week")
  const [leavePeriod, setLeavePeriod] = useState<"weekly" | "monthly" | "annually">("monthly")
  const [weekSchedules, setWeekSchedules] = useState<any[]>([])
  const [weekAttendance, setWeekAttendance] = useState<any[]>([])

  // Fetch Firestore data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const [emps, brs] = await Promise.all([getActiveEmployees(), getAllBranches()])
        console.log("Reports: Fetched employees from Firestore", emps)
        console.log("Reports: Fetched branches from Firestore", brs)
        setEmployees(emps)
        setBranches(brs)
      } catch (error) {
        console.error("Reports: Error fetching data from Firestore:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  // Use employees from Firestore
  const crews = employees

  const crewsWithSampleLeaves = useMemo(() => {
    return crews.map((crew: any) => ({
      ...crew,
      leaveRequests: [
        {
          id: 1,
          crewId: crew.id,
          startDate: "2025-01-10",
          endDate: "2025-01-12",
          reason: "Personal",
          status: "approved" as const,
          type: "personal" as const,
          createdAt: "2025-01-01",
        },
        {
          id: 2,
          crewId: crew.id,
          startDate: "2025-02-14",
          endDate: "2025-02-16",
          reason: "Sick Leave",
          status: "approved" as const,
          type: "sick" as const,
          createdAt: "2025-02-01",
        },
        {
          id: 3,
          crewId: crew.id,
          startDate: "2025-03-05",
          endDate: "2025-03-07",
          reason: "Vacation",
          status: "approved" as const,
          type: "vacation" as const,
          createdAt: "2025-02-20",
        },
        {
          id: 4,
          crewId: crew.id,
          startDate: "2025-04-12",
          endDate: "2025-04-14",
          reason: "Family",
          status: "pending" as const,
          type: "personal" as const,
          createdAt: "2025-04-01",
        },
        {
          id: 5,
          crewId: crew.id,
          startDate: "2025-05-20",
          endDate: "2025-05-22",
          reason: "Vacation",
          status: "approved" as const,
          type: "vacation" as const,
          createdAt: "2025-05-05",
        },
        {
          id: 6,
          crewId: crew.id,
          startDate: "2025-06-10",
          endDate: "2025-06-12",
          reason: "Medical",
          status: "approved" as const,
          type: "sick" as const,
          createdAt: "2025-06-01",
        },
        {
          id: 7,
          crewId: crew.id,
          startDate: "2025-07-25",
          endDate: "2025-07-27",
          reason: "Vacation",
          status: "approved" as const,
          type: "vacation" as const,
          createdAt: "2025-07-10",
        },
        {
          id: 8,
          crewId: crew.id,
          startDate: "2025-08-15",
          endDate: "2025-08-17",
          reason: "Personal",
          status: "rejected" as const,
          type: "personal" as const,
          createdAt: "2025-08-01",
        },
        {
          id: 9,
          crewId: crew.id,
          startDate: "2025-09-08",
          endDate: "2025-09-10",
          reason: "Sick Leave",
          status: "approved" as const,
          type: "sick" as const,
          createdAt: "2025-09-01",
        },
        {
          id: 10,
          crewId: crew.id,
          startDate: "2025-10-18",
          endDate: "2025-10-20",
          reason: "Vacation",
          status: "approved" as const,
          type: "vacation" as const,
          createdAt: "2025-10-05",
        },
        {
          id: 11,
          crewId: crew.id,
          startDate: "2025-11-05",
          endDate: "2025-11-07",
          reason: "Personal",
          status: "pending" as const,
          type: "personal" as const,
          createdAt: "2025-11-01",
        },
        {
          id: 12,
          crewId: crew.id,
          startDate: "2025-12-22",
          endDate: "2025-12-26",
          reason: "Holiday Vacation",
          status: "approved" as const,
          type: "vacation" as const,
          createdAt: "2025-12-01",
        },
      ],
    }))
  }, [crews])

  // Firestore leave requests state
  const [leaveRequests, setLeaveRequests] = useState<any[]>([])

  // Fetch leave requests from Firestore
  useEffect(() => {
    const fetchLeaves = async () => {
      try {
        const leaves = await getAllLeaveRequests()
        console.log('Reports: fetched leave requests', leaves.length)
        setLeaveRequests(leaves)
      } catch (error) {
        console.error('Error fetching leave requests:', error)
        setLeaveRequests([])
      }
    }
    fetchLeaves()
  }, [])

  // Helper function to get employees for a branch
  const getCrewsForBranch = (branchId: string | number) => {
    return crews.filter((emp) => emp.branchId && String(emp.branchId) === String(branchId))
  }

  // Calculate crew distribution data
  const fullTimeCount = crews.filter((crew) => crew.type === "full-time").length
  const partTimeCount = crews.filter((crew) => crew.type === "part-time").length
  const unassignedCount =
    crews.length -
    crews.filter((crew) => {
      for (const branch of branches) {
        if (getCrewsForBranch(branch.id).some((c) => String(c.id) === String(crew.id))) {
          return true
        }
      }
      return false
    }).length

  // Format data for crew distribution pie chart
  const crewDistributionData = {
    labels: ["Full-Time", "Part-Time", "Unassigned"],
    datasets: [
      {
        label: "Crew Distribution",
        data: [fullTimeCount, partTimeCount, unassignedCount],
        backgroundColor: [
          "rgba(14, 165, 233, 0.7)", // blue
          "rgba(139, 92, 246, 0.7)", // purple
          "rgba(245, 158, 11, 0.7)", // amber
        ],
        borderColor: ["rgba(14, 165, 233, 1)", "rgba(139, 92, 246, 1)", "rgba(245, 158, 11, 1)"],
        borderWidth: 1,
      },
    ],
  }

  // Chart options
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom" as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || ""
            const value = context.raw || 0
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0
            return `${label}: ${value} (${percentage}%)`
          },
        },
      },
    },
  }

  // Helper function to get assigned branch
  function getAssignedBranch(crewId: string | number) {
    return branches.find((branch) => getCrewsForBranch(branch.id).some((c) => String(c.id) === String(crewId)))
  }

  // Helper function to get week start (Monday) from a date
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }

  // Helper function to get the date string from a date
  const getDateString = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  // Fetch schedules and real attendance for the entire week (Monday to Sunday)
  useEffect(() => {
    const fetchWeekData = async () => {
      try {
        // Calculate week end (Sunday)
        const weekEnd = new Date(weekStartDate)
        weekEnd.setDate(weekEnd.getDate() + 6)
        const weekStartStr = getDateString(weekStartDate)
        const weekEndStr = getDateString(weekEnd)

        // Fetch schedules by weekStart (single query)
        let allWeekSchedules: any[] = []
        try {
          const res = await fetch(`/api/schedules?weekStart=${weekStartStr}`)
          if (res.ok) {
            const schedules = await res.json()
            // Deduplicate by scheduleFor, keeping latest per day
            const byDate: Record<string, any> = {}
            for (const sched of schedules) {
              const targetDate = sched.scheduleFor || sched.date
              const existing = byDate[targetDate]
              if (!existing || new Date(sched.updatedAt || sched.createdAt || 0) > new Date(existing.updatedAt || existing.createdAt || 0)) {
                byDate[targetDate] = sched
              }
            }
            allWeekSchedules = Object.values(byDate)
          }
        } catch (e) {
          console.warn('Error fetching week schedules:', e)
        }

        // Fetch real attendance from daily_attendance table
        let attendanceRecords: any[] = []
        try {
          attendanceRecords = await getAttendanceForDateRange(weekStartStr, weekEndStr)
        } catch (e) {
          console.warn('Error fetching week attendance:', e)
        }

        setWeekSchedules(allWeekSchedules)
        setWeekAttendance(attendanceRecords)
        console.log('Week schedules loaded:', allWeekSchedules.length, 'days, attendance:', attendanceRecords.length, 'records')
      } catch (error) {
        console.error('Error fetching week data:', error)
        setWeekSchedules([])
        setWeekAttendance([])
      }
    }
    fetchWeekData()
  }, [weekStartDate])

  // Build a lookup: employeeId_date -> "present"|"absent" from real attendance records
  const attendanceLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    for (const rec of weekAttendance) {
      const dateStr = typeof rec.date === 'string' && rec.date.includes('T') ? rec.date.split('T')[0] : rec.date
      lookup[`${rec.employeeId}_${dateStr}`] = rec.status
    }
    return lookup
  }, [weekAttendance])

  // Generate historical attendance data for the entire week
  // Cross-references schedule assignments with actual daily_attendance records
  const attendanceHistory = useMemo(() => {
    const branchEmployees: Record<string, any[]> = {}
    
    // Initialize branches
    branchEmployees["Unassigned"] = []
    branches.forEach((branch) => {
      branchEmployees[branch.branchName] = []
    })

    // Count attendance across the week using REAL attendance data
    const employeeAttendance: Record<string, { present: number; total: number }> = {}

    // Initialize attendance tracking for all employees
    crews.forEach((crew) => {
      employeeAttendance[String(crew.id)] = { present: 0, total: 0 }
    })

    // Count presence for each day in the week
    weekSchedules.forEach((schedule: any) => {
      if (schedule && schedule.branchAssignments) {
        const scheduleDate = schedule.scheduleFor || schedule.date
        schedule.branchAssignments.forEach((branchAssignment: any) => {
          const employees = branchAssignment.employees || []
          employees.forEach((emp: any) => {
            const empId = String(emp.employeeId)
            if (employeeAttendance[empId]) {
              employeeAttendance[empId].total++
              // Check real attendance from daily_attendance table
              const realStatus = attendanceLookup[`${empId}_${scheduleDate}`]
              if (realStatus === 'present') {
                employeeAttendance[empId].present++
              }
              // If no attendance record exists, count as absent (not present)
            }
          })
        })
      }
    })

    // Build attendance history from week data
    crews.forEach((crew) => {
      const assignedBranch = getAssignedBranch(crew.id)
      const branchName = assignedBranch ? assignedBranch.branchName : "Unassigned"
      const attendance = employeeAttendance[String(crew.id)]
      
      branchEmployees[branchName].push({
        ...crew,
        wasPresent: attendance.present > 0,
        presentDays: attendance.present,
        totalDays: attendance.total,
      })
    })

    return Object.entries(branchEmployees)
      .filter(([_, employees]: [string, any[]]) => employees.length > 0)
      .map(([branchName, employees]: [string, any[]]) => ({
        branchName,
        employees,
        presentCount: employees.filter((emp: any) => emp.wasPresent).length,
        absentCount: employees.filter((emp: any) => !emp.wasPresent).length,
      }))
  }, [weekSchedules, weekAttendance, attendanceLookup, crews, branches])

  // Calculate overall attendance for the week
  const overallAttendance = useMemo(() => {
    const allEmployees = attendanceHistory.flatMap((branch: any) => branch.employees)
    const presentCount = allEmployees.filter((emp: any) => emp.wasPresent).length
    const totalCount = allEmployees.length
    const rate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

    return { presentCount, totalCount, rate, absentCount: totalCount - presentCount }
  }, [attendanceHistory])

  // Calculate crew allocation by branch from schedules + real attendance
  const crewAllocationByBranch = useMemo(() => {
    const allocationMap = new Map<string, { fullTime: number; partTime: number; total: number; presentCount: number }>()

    // Initialize map for all branches
    branches.forEach((branch) => {
      allocationMap.set(branch.branchName, { fullTime: 0, partTime: 0, total: 0, presentCount: 0 })
    })

    // Count employees by type from all schedules
    weekSchedules.forEach((schedule: any) => {
      if (schedule && schedule.branchAssignments) {
        const scheduleDate = schedule.scheduleFor || schedule.date
        schedule.branchAssignments.forEach((branchAssignment: any) => {
          const branchName = branchAssignment.branchName
          const employees = branchAssignment.employees || []

          if (!allocationMap.has(branchName)) {
            allocationMap.set(branchName, { fullTime: 0, partTime: 0, total: 0, presentCount: 0 })
          }

          const branchData = allocationMap.get(branchName)!

          employees.forEach((emp: any) => {
            const empId = String(emp.employeeId)
            const employeeRecord = crews.find((c: any) => String(c.id) === empId)

            if (employeeRecord) {
              if (employeeRecord.type === "full-time") {
                branchData.fullTime++
              } else if (employeeRecord.type === "part-time") {
                branchData.partTime++
              }
            }

            branchData.total++
            // Use real attendance data instead of always-true isPresent
            const realStatus = attendanceLookup[`${empId}_${scheduleDate}`]
            if (realStatus === 'present') {
              branchData.presentCount++
            }
          })
        })
      }
    })

    // Convert map to array and calculate attendance rate
    return Array.from(allocationMap.entries()).map(([branchName, data]) => {
      const attendanceRate = data.total > 0 ? Math.round((data.presentCount / data.total) * 100) : 0
      return {
        branchName,
        fullTime: data.fullTime,
        partTime: data.partTime,
        total: data.total,
        attendanceRate,
      }
    })
  }, [weekSchedules, weekAttendance, attendanceLookup, crews, branches])

  // Calculate branch distribution from Firestore schedules
  const branchDistributionData = useMemo(() => {
    const labels = crewAllocationByBranch.map((alloc: any) => alloc.branchName)
    const data = crewAllocationByBranch.map((alloc: any) => alloc.total)

    return {
      labels,
      datasets: [
        {
          label: "Branch Distribution",
          data,
          backgroundColor: [
            "rgba(16, 185, 129, 0.7)", // green
            "rgba(244, 63, 94, 0.7)", // rose
            "rgba(6, 182, 212, 0.7)", // cyan
            "rgba(139, 92, 246, 0.7)", // purple
            "rgba(245, 158, 11, 0.7)", // amber
            "rgba(132, 204, 22, 0.7)", // lime
            "rgba(236, 72, 153, 0.7)", // pink
          ],
          borderColor: [
            "rgba(16, 185, 129, 1)",
            "rgba(244, 63, 94, 1)",
            "rgba(6, 182, 212, 1)",
            "rgba(139, 92, 246, 1)",
            "rgba(245, 158, 11, 1)",
            "rgba(132, 204, 22, 1)",
            "rgba(236, 72, 153, 1)",
          ],
          borderWidth: 1,
        },
      ],
    }
  }, [crewAllocationByBranch])

  // Generate attendance trend data
  const attendanceTrendData = useMemo(() => {
    if (timeRange === "day") {
      // Daily view: show Monday to Sunday of the selected week
      const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      const presentData = []
      const absentData = []

      // Get attendance data for each day of the week
      for (let i = 0; i < 7; i++) {
        const dateToCheck = new Date(weekStartDate)
        dateToCheck.setDate(dateToCheck.getDate() + i)
        const dateISO = getDateString(dateToCheck)
        
        // Find schedule for this day by scheduleFor
        const daySchedule = weekSchedules.find((schedule: any) => {
          const targetDate = schedule.scheduleFor || schedule.date
          return targetDate === dateISO
        })

        if (daySchedule && daySchedule.branchAssignments) {
          // Count real attendance from daily_attendance table
          let present = 0
          let absent = 0
          daySchedule.branchAssignments.forEach((branch: any) => {
            const employees = branch.employees || []
            employees.forEach((emp: any) => {
              const realStatus = attendanceLookup[`${emp.employeeId}_${dateISO}`]
              if (realStatus === 'present') {
                present++
              } else {
                absent++
              }
            })
          })
          presentData.push(present)
          absentData.push(absent)
        } else {
          // No schedule for this day
          presentData.push(0)
          absentData.push(0)
        }
      }

      return {
        labels,
        datasets: [
          {
            label: "Present",
            data: presentData,
            backgroundColor: "rgba(34, 197, 94, 0.5)",
            borderColor: "rgba(34, 197, 94, 1)",
            borderWidth: 1,
          },
          {
            label: "Absent",
            data: absentData,
            backgroundColor: "rgba(239, 68, 68, 0.5)",
            borderColor: "rgba(239, 68, 68, 1)",
            borderWidth: 1,
          },
        ],
      }
    }

    // Weekly view: show 4 latest weeks (with or without attendance data)
    if (timeRange === "week") {
      // Build a map of weeks with their attendance data
      const weeksMap = new Map<string, { label: string; present: number; absent: number; date: Date }>()

      // Scan all schedules to find weeks with attendance
      weekSchedules.forEach((schedule: any) => {
        if (schedule && schedule.branchAssignments) {
          const schedDateStr = schedule.scheduleFor || schedule.date
          const scheduleDate = new Date(schedDateStr + "T00:00:00")
          const weekStart = getWeekStart(scheduleDate)
          const weekLabel = `Week ${format(weekStart, "w")} (${format(weekStart, "MMM d")})`
          const weekKey = weekLabel

          if (!weeksMap.has(weekKey)) {
            weeksMap.set(weekKey, { label: weekLabel, present: 0, absent: 0, date: weekStart })
          }

          // Count real attendance for this day
          const weekData = weeksMap.get(weekKey)!
          schedule.branchAssignments.forEach((branch: any) => {
            const employees = branch.employees || []
            employees.forEach((emp: any) => {
              const realStatus = attendanceLookup[`${emp.employeeId}_${schedDateStr}`]
              if (realStatus === 'present') {
                weekData.present++
              } else {
                weekData.absent++
              }
            })
          })
        }
      })

      // Generate 4 latest weeks (whether they have data or not)
      const fourLatestWeeks = []
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - i * 7)
        const weekStartDate = getWeekStart(weekStart)
        const weekLabel = `Week ${format(weekStartDate, "w")} (${format(weekStartDate, "MMM d")})`
        fourLatestWeeks.push({ label: weekLabel, date: weekStartDate })
      }

      // Map attendance data to the 4 latest weeks
      const labels: string[] = []
      const presentData: number[] = []
      const absentData: number[] = []

      fourLatestWeeks.forEach((week) => {
        labels.push(week.label)
        
        // Find matching week in weeksMap
        const matchingWeek = Array.from(weeksMap.values()).find(
          (w) => w.date.toDateString() === week.date.toDateString()
        )

        if (matchingWeek) {
          presentData.push(matchingWeek.present)
          absentData.push(matchingWeek.absent)
        } else {
          // No data for this week
          presentData.push(0)
          absentData.push(0)
        }
      })

      return {
        labels,
        datasets: [
          {
            label: "Present",
            data: presentData,
            backgroundColor: "rgba(34, 197, 94, 0.5)",
            borderColor: "rgba(34, 197, 94, 1)",
            borderWidth: 1,
          },
          {
            label: "Absent",
            data: absentData,
            backgroundColor: "rgba(239, 68, 68, 0.5)",
            borderColor: "rgba(239, 68, 68, 1)",
            borderWidth: 1,
          },
        ],
      }
    }

    // Monthly view: aggregate real data from schedules for all months (January to December)
    const monthLabels = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const monthPresentData: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const monthAbsentData: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

    // Aggregate real attendance data from all schedules grouped by month
    weekSchedules.forEach((schedule: any) => {
      if (schedule && schedule.branchAssignments) {
        const schedDateStr = schedule.scheduleFor || schedule.date
        const scheduleDate = new Date(schedDateStr + "T00:00:00")
        const monthIndex = scheduleDate.getMonth() // 0-11

        schedule.branchAssignments.forEach((branch: any) => {
          const employees = branch.employees || []
          employees.forEach((emp: any) => {
            const realStatus = attendanceLookup[`${emp.employeeId}_${schedDateStr}`]
            if (realStatus === 'present') {
              monthPresentData[monthIndex]++
            } else {
              monthAbsentData[monthIndex]++
            }
          })
        })
      }
    })

    return {
      labels: monthLabels,
      datasets: [
        {
          label: "Present",
          data: monthPresentData,
          backgroundColor: "rgba(34, 197, 94, 0.5)",
          borderColor: "rgba(34, 197, 94, 1)",
          borderWidth: 1,
        },
        {
          label: "Absent",
          data: monthAbsentData,
          backgroundColor: "rgba(239, 68, 68, 0.5)",
          borderColor: "rgba(239, 68, 68, 1)",
          borderWidth: 1,
        },
      ],
    }
  }, [crews.length, timeRange, weekSchedules, weekStartDate, attendanceLookup])

  // Generate restaurant deployment data
  const restaurantDeploymentData = useMemo(() => {
    // Use crew allocation computed from schedules
    const labels = crewAllocationByBranch.map((c) => c.branchName)
    const data = crewAllocationByBranch.map((c) => c.total)

    return {
      labels,
      datasets: [
        {
          label: "Assigned Employees",
          data,
          backgroundColor: "rgba(139, 92, 246, 0.5)",
          borderColor: "rgba(139, 92, 246, 1)",
          borderWidth: 1,
        },
      ],
    }
  }, [crewAllocationByBranch])
  
  // Generate leave trend data
  const leaveTrendData = useMemo(() => {
    const approvedLeaves = leaveRequests.filter((l: any) => l.status === "approved")

    if (leavePeriod === "monthly") {
      const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      const leaveCounts = new Array(12).fill(0)

      approvedLeaves.forEach((leave: any) => {
        const leaveDate = new Date(leave.startDate)
        if (!isNaN(leaveDate.getTime())) leaveCounts[leaveDate.getMonth()]++
      })

      return {
        labels: monthLabels,
        datasets: [
          {
            label: "Approved Leaves",
            data: leaveCounts,
            backgroundColor: "rgba(59, 130, 246, 0.7)",
            borderColor: "rgba(59, 130, 246, 1)",
            borderWidth: 1,
          },
        ],
      }
    } else if (leavePeriod === "weekly") {
      const weekLabels = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]
      const leaveCounts = new Array(5).fill(0)

      approvedLeaves.forEach((leave: any) => {
        const leaveDate = new Date(leave.startDate)
        if (!isNaN(leaveDate.getTime())) {
          const week = Math.floor((leaveDate.getDate() - 1) / 7) // 0-based
          if (week >= 0 && week < 5) leaveCounts[week]++
        }
      })

      return {
        labels: weekLabels,
        datasets: [
          {
            label: "Approved Leaves",
            data: leaveCounts,
            backgroundColor: "rgba(34, 197, 94, 0.7)",
            borderColor: "rgba(34, 197, 94, 1)",
            borderWidth: 1,
          },
        ],
      }
    } else {
      // Yearly summary for last 4 years
      const currentYear = new Date().getFullYear()
      const yearLabels = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear].map(String)
      const leaveCounts = new Array(4).fill(0)

      approvedLeaves.forEach((leave: any) => {
        const leaveDate = new Date(leave.startDate)
        if (!isNaN(leaveDate.getTime())) {
          const idx = leaveDate.getFullYear() - (currentYear - 3)
          if (idx >= 0 && idx < 4) leaveCounts[idx]++
        }
      })

      return {
        labels: yearLabels,
        datasets: [
          {
            label: "Approved Leaves",
            data: leaveCounts,
            backgroundColor: "rgba(168, 85, 247, 0.7)",
            borderColor: "rgba(168, 85, 247, 1)",
            borderWidth: 1,
          },
        ],
      }
    }
  }, [leaveRequests, leavePeriod])

  // Generate leave summary statistics
  const leaveSummary = useMemo(() => {
    let totalApproved = 0
    let totalPending = 0
    let totalRejected = 0

    leaveRequests.forEach((leave: any) => {
      if (leave.status === "approved") totalApproved++
      else if (leave.status === "pending") totalPending++
      else if (leave.status === "rejected") totalRejected++
    })

    return { totalApproved, totalPending, totalRejected }
  }, [leaveRequests])

  // Quick week selection buttons
  const handleQuickWeekSelect = (weeks: number) => {
    const newDate = new Date()
    newDate.setDate(newDate.getDate() - weeks * 7)
    setWeekStartDate(getWeekStart(newDate))
  }

  // Check if the selected week contains today
  const isCurrentWeek = (() => {
    const today = new Date()
    const weekEnd = new Date(weekStartDate)
    weekEnd.setDate(weekEnd.getDate() + 6)
    return today >= weekStartDate && today <= weekEnd
  })()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports Dashboard</h1>
        <p className="text-muted-foreground">View crew distribution and attendance metrics</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="attendance">Attendance Report</TabsTrigger>
          <TabsTrigger value="allocation">Crew Allocation Summary</TabsTrigger>
          <TabsTrigger value="deployment">Restaurant Deployment</TabsTrigger>
          <TabsTrigger value="leaves">Leave Reports</TabsTrigger>
        </TabsList>

        {/* Attendance Report Tab */}
        <TabsContent value="attendance" className="space-y-6 mt-6">
          {/* Attendance Trend Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Attendance Trend</CardTitle>
              <Select value={timeRange} onValueChange={(value: "day" | "week" | "month") => setTimeRange(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ChartContainer className="h-[300px]">
                <Chart
                  type="bar"
                  data={attendanceTrendData}
                  options={{
                    responsive: true,
                    scales: {
                      x: {
                        stacked: true,
                      },
                      y: {
                        stacked: true,
                        beginAtZero: true,
                      },
                    },
                    plugins: {
                      legend: {
                        position: "top" as const,
                      },
                    },
                  }}
                />
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Overall attendance summary for selected week */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-2 flex items-center">
              Attendance Summary for Week of {format(weekStartDate, "MMMM d, yyyy")}
              {isCurrentWeek && <Badge className="ml-2 bg-blue-500 text-white">Current Week</Badge>}
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                  {overallAttendance.presentCount} Present
                </Badge>
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                  {overallAttendance.absentCount} Absent
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Attendance Rate:</span>
                <span className="font-medium">{overallAttendance.rate}%</span>
              </div>

              <div className="flex-1 hidden sm:block">
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${overallAttendance.rate}%` }}></div>
                </div>
              </div>
            </div>

            {isCurrentWeek && (
              <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                Note: This week's attendance reflects the current status from the dashboard.
              </div>
            )}
          </div>

          {/* Branch-wise attendance logs */}
          <div className="space-y-6">
            {attendanceHistory.map((branch: any) => (
              <div key={branch.branchName} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 p-3 flex justify-between items-center">
                  <h3 className="font-medium">{branch.branchName}</h3>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                    >
                      {branch.presentCount} Present
                    </Badge>
                    <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                      {branch.absentCount} Absent
                    </Badge>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-sm">Name</th>
                        <th className="text-left px-4 py-2 font-medium text-sm">Days Present</th>
                        <th className="text-left px-4 py-2 font-medium text-sm">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {branch.employees.map((employee: any) => (
                        <tr
                          key={employee.id}
                          className={employee.wasPresent ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{employee.firstName} {employee.surname}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {employee.presentDays || 0}/{employee.totalDays || 7}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={employee.wasPresent ? "default" : "destructive"}>
                              {employee.wasPresent ? "Present" : "Absent"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Crew Allocation Summary Tab */}
        <TabsContent value="allocation" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Crew Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {crews.length > 0 ? (
                  <ChartContainer className="h-[300px]">
                    <Chart type="pie" data={crewDistributionData} options={chartOptions} className="max-w-full" />
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">No data available</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Branch Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {crewAllocationByBranch.length > 0 && crewAllocationByBranch.some((alloc: any) => alloc.total > 0) ? (
                  <ChartContainer className="h-[300px]">
                    <Chart type="pie" data={branchDistributionData} options={chartOptions} className="max-w-full" />
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    No branches available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Crew Allocation Table */}
          <Card>
            <CardHeader>
              <CardTitle>Crew Allocation by Branch</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-muted/50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        Branch
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        Full-Time
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        Part-Time
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        Total
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        Attendance Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-gray-200">
                    {crewAllocationByBranch.map((allocation: any) => {
                      return (
                        <tr key={allocation.branchName}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{allocation.branchName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{allocation.fullTime}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{allocation.partTime}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{allocation.total}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <span className="mr-2">{allocation.attendanceRate}%</span>
                              <div className="w-24 bg-muted rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    allocation.attendanceRate >= 75
                                      ? "bg-green-500"
                                      : allocation.attendanceRate >= 50
                                        ? "bg-amber-500"
                                        : "bg-red-500"
                                  }`}
                                  style={{ width: `${allocation.attendanceRate}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Restaurant Deployment Tab */}
        <TabsContent value="deployment" className="space-y-6 mt-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Restaurant Deployment Record</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-5 w-5 mr-2" />
                  Branch Deployment Overview
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Scheduled: {crewAllocationByBranch.reduce((s, a) => s + a.total, 0)}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer className="h-[400px]">
                <Chart
                  type="bar"
                  data={restaurantDeploymentData}
                  options={{
                    responsive: true,
                    scales: {
                      y: {
                        beginAtZero: true,
                      },
                    },
                    plugins: {
                      legend: {
                        position: "top" as const,
                      },
                    },
                  }}
                />
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Detailed per-branch deployment removed — showing overview across all branches */}
        </TabsContent>

        {/* Leave Reports Tab */}
        <TabsContent value="leaves" className="space-y-6 mt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <h2 className="text-xl font-semibold">Leave Trend Analysis</h2>
            <Select
              value={leavePeriod}
              onValueChange={(value: "weekly" | "monthly" | "annually") => setLeavePeriod(value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Leave Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Approved Leaves</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{leaveSummary.totalApproved}</div>
                <p className="text-xs text-muted-foreground mt-1">Total approved this period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{leaveSummary.totalPending}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{leaveSummary.totalRejected}</div>
                <p className="text-xs text-muted-foreground mt-1">Declined requests</p>
              </CardContent>
            </Card>
          </div>

          {/* Leave Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Leave Trend Chart
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer className="h-[350px]">
                <Chart
                  type="bar"
                  data={leaveTrendData}
                  options={{
                    responsive: true,
                    scales: {
                      y: {
                        beginAtZero: true,
                      },
                    },
                    plugins: {
                      legend: {
                        position: "top" as const,
                      },
                      tooltip: {
                        callbacks: {
                          label: (context: any) => {
                            return `${context.dataset.label}: ${context.parsed.y} leaves`
                          },
                        },
                      },
                    },
                  }}
                />
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Leave Distribution Info */}
          <Card>
            <CardHeader>
              <CardTitle>Leave Distribution Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-600">✓</Badge>
                    <span className="font-medium">Approved Leaves</span>
                  </div>
                  <span className="text-2xl font-bold text-green-600">{leaveSummary.totalApproved}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-600">!</Badge>
                    <span className="font-medium">Pending Requests</span>
                  </div>
                  <span className="text-2xl font-bold text-amber-600">{leaveSummary.totalPending}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-600">✕</Badge>
                    <span className="font-medium">Rejected Leaves</span>
                  </div>
                  <span className="text-2xl font-bold text-red-600">{leaveSummary.totalRejected}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

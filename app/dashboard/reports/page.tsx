"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getActiveEmployees } from "@/lib/firestore-employee-service"
import { getAllBranches } from "@/lib/firestore-branch-service"
import { CheckCircle2, XCircle, BarChart2, Users, MapPin } from "lucide-react"
import { Chart, ChartContainer } from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format, subDays, isWeekend, isToday, isBefore, startOfDay, subMonths } from "date-fns"
import { BasicDatePicker } from "@/components/ui/basic-date-picker"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ReportsPage() {
  const [branches, setBranches] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [activeTab, setActiveTab] = useState("attendance")
  const [selectedBranch, setSelectedBranch] = useState<string>("all")
  const [timeRange, setTimeRange] = useState<"day" | "week" | "month">("week")

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

  // Calculate branch distribution
  const branchNames = branches.map((branch) => branch.branchName)
  const branchCounts = branches.map((branch) => getCrewsForBranch(branch.id).length)

  // Format data for branch distribution pie chart
  const branchDistributionData = {
    labels: branchNames,
    datasets: [
      {
        label: "Branch Distribution",
        data: branchCounts,
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

  // Generate historical attendance data for the selected date
  const attendanceHistory = useMemo(() => {
    // Check if the selected date is today
    const isCurrentDay = isToday(selectedDate)
    const dateValue = selectedDate.getTime()
    const isWeekendDay = isWeekend(selectedDate)

    // Group employees by branch
    const branchEmployees: Record<string, any[]> = {}

    // Initialize with "Unassigned" category
    branchEmployees["Unassigned"] = []

    // Initialize all branches
    branches.forEach((branch) => {
      branchEmployees[branch.branchName] = []
    })

    // Process each employee
    crews.forEach((crew) => {
      let wasPresent

      // For now, use simulated attendance data
      const basePresentChance = crew.type === "full-time" ? 90 : 60
      const hash = ((crew.id as any) * 31 + dateValue) % 100
      wasPresent = hash < basePresentChance

      // Determine which branch they worked at
      const assignedBranch = getAssignedBranch(crew.id)
      const branchName = assignedBranch ? assignedBranch.branchName : "Unassigned"

      // Add to the appropriate branch group
      branchEmployees[branchName].push({
        ...crew,
        wasPresent,
      })
    })

    // Convert to array format for rendering
    return Object.entries(branchEmployees)
      .filter(([_, employees]) => employees.length > 0)
      .map(([branchName, employees]) => ({
        branchName,
        employees,
        presentCount: employees.filter((emp) => emp.wasPresent).length,
        absentCount: employees.filter((emp) => !emp.wasPresent).length,
      }))
  }, [crews, branches, selectedDate])

  // Calculate overall attendance for the selected date
  const overallAttendance = useMemo(() => {
    const allEmployees = attendanceHistory.flatMap((branch) => branch.employees)
    const presentCount = allEmployees.filter((emp) => emp.wasPresent).length
    const totalCount = allEmployees.length
    const rate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

    return { presentCount, totalCount, rate, absentCount: totalCount - presentCount }
  }, [attendanceHistory])

  // Generate attendance trend data
  const attendanceTrendData = useMemo(() => {
    const days = timeRange === "day" ? 7 : timeRange === "week" ? 4 : 12
    const labels = []
    const presentData = []
    const absentData = []
    const percentageData = []

    for (let i = days - 1; i >= 0; i--) {
      const date =
        timeRange === "day"
          ? subDays(new Date(), i)
          : timeRange === "week"
            ? subDays(new Date(), i * 7)
            : subMonths(new Date(), i)

      const label =
        timeRange === "day"
          ? format(date, "EEE")
          : timeRange === "week"
            ? `Week ${format(date, "w")}`
            : format(date, "MMM")

      labels.push(label)

      // Simulate attendance data
      const totalEmployees = crews.length
      const presentPercentage = Math.floor(Math.random() * 30) + 70 // 70-99%
      const presentCount = Math.round((totalEmployees * presentPercentage) / 100)
      const absentCount = totalEmployees - presentCount

      presentData.push(presentCount)
      absentData.push(absentCount)
      percentageData.push(presentPercentage)
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
  }, [crews.length, timeRange])

  // Generate restaurant deployment data
  const restaurantDeploymentData = useMemo(() => {
    if (selectedBranch === "all") {
      return {
        labels: branches.map((b) => b.branchName),
        datasets: [
          {
            label: "Assigned Employees",
            data: branches.map((branch) => getCrewsForBranch(branch.id).length),
            backgroundColor: "rgba(139, 92, 246, 0.5)",
            borderColor: "rgba(139, 92, 246, 1)",
            borderWidth: 1,
          },
        ],
      }
    } else {
      const branch = branches.find((b) => String(b.id) === selectedBranch)
      if (!branch) return { labels: [], datasets: [] }

      const crewMembers = getCrewsForBranch(branch.id)
      return {
        labels: crewMembers.map((c) => `${c.firstName} ${c.surname}`),
        datasets: [
          {
            label: "Shifts Assigned",
            data: crewMembers.map(() => Math.floor(Math.random() * 20) + 5),
            backgroundColor: "rgba(59, 130, 246, 0.5)",
            borderColor: "rgba(59, 130, 246, 1)",
            borderWidth: 1,
          },
        ],
      }
    }
  }, [branches, selectedBranch, crews])

  // Quick date selection buttons
  const handleQuickDateSelect = (days: number) => {
    const date = subDays(new Date(), days)
    setSelectedDate(date)
  }

  // Check if the selected date is today
  const isSelectedDateToday = isToday(selectedDate)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports Dashboard</h1>
        <p className="text-muted-foreground">View crew distribution and attendance metrics</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attendance">Attendance Report</TabsTrigger>
          <TabsTrigger value="allocation">Crew Allocation Summary</TabsTrigger>
          <TabsTrigger value="deployment">Restaurant Deployment</TabsTrigger>
        </TabsList>

        {/* Attendance Report Tab */}
        <TabsContent value="attendance" className="space-y-6 mt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={isToday(selectedDate) ? "default" : "outline"}
                size="sm"
                onClick={() => handleQuickDateSelect(0)}
              >
                Today
              </Button>
              <Button
                variant={
                  isBefore(startOfDay(selectedDate), startOfDay(new Date())) &&
                  isBefore(startOfDay(subDays(new Date(), 1)), startOfDay(selectedDate))
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() => handleQuickDateSelect(1)}
              >
                Yesterday
              </Button>
              <Button
                variant={
                  isBefore(startOfDay(selectedDate), startOfDay(subDays(new Date(), 1))) &&
                  isBefore(startOfDay(subDays(new Date(), 7)), startOfDay(selectedDate))
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() => handleQuickDateSelect(7)}
              >
                Last Week
              </Button>
            </div>

            <div className="flex-1 min-w-[280px] max-w-xs">
              <div className="text-sm font-medium mb-1.5 text-muted-foreground">Select Date:</div>
              <BasicDatePicker date={selectedDate} setDate={setSelectedDate} className="w-full" />
            </div>
          </div>

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

          {/* Overall attendance summary for selected date */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-2 flex items-center">
              Attendance Summary for {format(selectedDate, "EEEE, MMMM d, yyyy")}
              {isSelectedDateToday && <Badge className="ml-2 bg-blue-500 text-white">Current Day</Badge>}
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

            {isSelectedDateToday && (
              <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                Note: Today's attendance reflects the current status from the dashboard.
              </div>
            )}
          </div>

          {/* Branch-wise attendance logs */}
          <div className="space-y-6">
            {attendanceHistory.map((branch) => (
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

                <div className="divide-y">
                  {branch.employees.map((employee) => (
                    <div
                      key={employee.id}
                      className={`p-3 flex justify-between items-center ${
                        employee.wasPresent ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {employee.wasPresent ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        )}
                        <div>
                          <div className="font-medium">
                            {employee.firstName} {employee.surname}
                          </div>
                          <div className="text-xs text-muted-foreground">{employee.type}</div>
                        </div>
                      </div>

                      <Badge variant={employee.wasPresent ? "default" : "destructive"}>
                        {employee.wasPresent ? "Present" : "Absent"}
                      </Badge>
                    </div>
                  ))}
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
                {branches.length > 0 && branchCounts.some((count) => count > 0) ? (
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
                    {branches.map((branch) => {
                      const branchCrews = getCrewsForBranch(branch.id)
                      const fullTimeCount = branchCrews.filter((c) => c.type === "full-time").length
                      const partTimeCount = branchCrews.filter((c) => c.type === "part-time").length
                      const totalCount = branchCrews.length
                      const presentCount = branchCrews.filter((c) => c.isPresent).length
                      const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

                      return (
                        <tr key={branch.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{branch.branchName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{fullTimeCount}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{partTimeCount}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{totalCount}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <span className="mr-2">{attendanceRate}%</span>
                              <div className="w-24 bg-muted rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    attendanceRate >= 75
                                      ? "bg-green-500"
                                      : attendanceRate >= 50
                                        ? "bg-amber-500"
                                        : "bg-red-500"
                                  }`}
                                  style={{ width: `${attendanceRate}%` }}
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
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.branchName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart2 className="h-5 w-5 mr-2" />
                {selectedBranch === "all"
                  ? "Branch Deployment Overview"
                  : `Deployment for ${branches.find((b) => b.id.toString() === selectedBranch)?.branchName}`}
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

          {/* Detailed Deployment Table */}
          {selectedBranch !== "all" && (
            <Card>
              <CardHeader>
                <CardTitle>Detailed Deployment Record</CardTitle>
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
                          Employee
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        >
                          Type
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        >
                          Shifts Assigned
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        >
                          Attendance Rate
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-gray-200">
                      {getCrewsForBranch(selectedBranch === "all" ? "" : selectedBranch).map((crew) => {
                        // Simulate attendance rate
                        const attendanceRate = Math.floor(Math.random() * 30) + 70

                        return (
                          <tr key={crew.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              {crew.firstName} {crew.surname}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">{crew.type || "Employee"}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">{Math.floor(Math.random() * 20) + 5}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <div className="flex items-center">
                                <span className="mr-2">{attendanceRate}%</span>
                                <div className="w-24 bg-muted rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      attendanceRate >= 75
                                        ? "bg-green-500"
                                        : attendanceRate >= 50
                                          ? "bg-amber-500"
                                          : "bg-red-500"
                                    }`}
                                    style={{ width: `${attendanceRate}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Badge variant={attendanceRate >= 75 ? "default" : "outline"}>
                                {attendanceRate >= 75 ? "Good" : "Fair"}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

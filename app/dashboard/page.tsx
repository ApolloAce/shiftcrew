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

export default function DashboardPage() {
  const { showNotification } = useNotification()
  const [employees, setEmployees] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [attendance, setAttendance] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch Firestore employees and branches on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const [emps, brs] = await Promise.all([getActiveEmployees(), getAllBranches()])
        console.log("Dashboard: Fetched employees from Firestore", emps)
        console.log("Dashboard: Fetched branches from Firestore", brs)
        setEmployees(emps)
        setBranches(brs)
      } catch (error) {
        console.error("Dashboard: Error fetching data from Firestore:", error)
        showNotification("error", "Error", "Failed to load dashboard data")
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [showNotification])

  // Use employees from Firestore
  const crews = employees

  // Calculate attendance statistics
  const presentCount = crews.filter((crew) => attendance[String(crew.id)]).length
  const totalCount = crews.length
  const attendancePercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

  const handleToggleAttendance = (crewId: string | number) => {
    const key = String(crewId)
    const newStatus = !attendance[key]
    setAttendance((prev) => ({ ...prev, [key]: newStatus }))

    // Find crew details for notification
    const crew = crews.find((c) => String(c.id) === key)

    if (crew) {
      showNotification(
        newStatus ? "success" : "info",
        `Marked ${newStatus ? "Present" : "Absent"}`,
        `${crew.firstName} ${crew.surname} has been marked as ${newStatus ? "present" : "absent"}.`,
      )
    } else {
      showNotification(
        newStatus ? "success" : "info",
        `Marked ${newStatus ? "Present" : "Absent"}`,
        `Employee has been marked as ${newStatus ? "present" : "absent"}.`,
      )
    }
  }

  // Get all employees that match the search query
  const filteredCrews = crews.filter((crew) => {
    const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
    return fullName.includes(searchQuery.toLowerCase())
  })

  // Group employees by their assigned branch (from Firestore)
  const getCrewsByBranch = () => {
    const result: Record<string, typeof crews> = {
      Unassigned: [],
    }

    // Initialize with all branches
    branches.forEach((branch) => {
      result[branch.branchName] = []
    })

    // Assign employees to their branches based on branchId field
    filteredCrews.forEach((crew) => {
      if (crew.branchId) {
        const branch = branches.find((b) => String(b.id) === String(crew.branchId))
        if (branch) {
          result[branch.branchName].push(crew)
        } else {
          result["Unassigned"].push(crew)
        }
      } else {
        result["Unassigned"].push(crew)
      }
    })

    return result
  }

  const crewsByBranch = getCrewsByBranch()

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
            {crews.length > 0 ? (
              <div className="space-y-8">
                {Object.entries(crewsByBranch).map(
                  ([branchName, branchCrews]) =>
                    branchCrews.length > 0 && (
                      <div key={branchName} className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2">{branchName}</h3>
                        <div className="space-y-3">
                          {branchCrews.map((crew) => (
                            <div
                              key={crew.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border bg-card gap-4"
                            >
                              <div>
                                <div className="font-medium">
                                  {crew.firstName} {crew.surname}
                                </div>
                                <div className="text-sm text-muted-foreground">{crew.type || "Employee"}</div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Badge variant={attendance[String(crew.id)] ? "default" : "destructive"}>
                                  {attendance[String(crew.id)] ? "Present" : "Absent"}
                                </Badge>
                                <Button
                                  variant={attendance[String(crew.id)] ? "destructive" : "default"}
                                  size="sm"
                                  onClick={() => handleToggleAttendance(crew.id)}
                                  className="w-full sm:w-auto"
                                >
                                  Mark {attendance[String(crew.id)] ? "Absent" : "Present"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                )}

                {filteredCrews.length === 0 && searchQuery && (
                  <div className="text-center py-8 text-muted-foreground">
                    No employees found matching "{searchQuery}"
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No employees registered</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branch Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {branches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {branches.map((branch) => {
                  // Get employees assigned to this branch
                  const assignedEmps = filteredCrews.filter(
                    (emp) => emp.branchId && String(emp.branchId) === String(branch.id),
                  )

                  return (
                    <Card key={branch.id} className="border shadow-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{branch.branchName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{branch.address}</p>
                      </CardHeader>
                      <CardContent>
                        {assignedEmps.length > 0 ? (
                          <div className="space-y-2">
                            {assignedEmps.map((emp) => (
                              <div
                                key={emp.id}
                                className={`flex justify-between items-center p-2 rounded-md text-sm ${
                                  attendance[String(emp.id)]
                                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                                }`}
                              >
                                <span>
                                  {emp.firstName} {emp.surname}
                                </span>
                                <span>{attendance[String(emp.id)] ? "✓" : "✗"}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-sm text-muted-foreground">No employees assigned</div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No branches available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

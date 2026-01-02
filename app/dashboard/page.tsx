"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Users } from "lucide-react"
import { useNotification } from "@/components/notification-provider"
import { useCrewStore } from "@/lib/cleanStore"

export default function DashboardPage() {
  const { showNotification } = useNotification()
  const { toggleAttendance, getCrewsForBranch, getAssignedBranch, getActiveCrews, branches } = useCrewStore()
  const [attendance, setAttendance] = useState<Record<number, boolean>>({})
  const [searchQuery, setSearchQuery] = useState("")

  // Use only active crews for the dashboard
  const crews = getActiveCrews()

  // Calculate attendance statistics
  const presentCount = crews.filter((crew) => attendance[crew.id]).length
  const totalCount = crews.length
  const attendancePercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

  useEffect(() => {
    // Initialize attendance state from store only once when crews change
    const initialAttendance: Record<number, boolean> = {}
    crews.forEach((crew) => {
      initialAttendance[crew.id] = crew.isPresent || false
    })

    // Compare with current state to avoid unnecessary updates
    setAttendance((prev) => {
      // Only update if there are actual differences
      const needsUpdate = crews.some((crew) => prev[crew.id] !== (crew.isPresent || false))
      return needsUpdate ? initialAttendance : prev
    })
  }, [crews])

  const handleToggleAttendance = (crewId: number) => {
    const newStatus = !attendance[crewId]
    setAttendance((prev) => ({ ...prev, [crewId]: newStatus }))
    toggleAttendance(crewId)

    // Find crew details for notification
    const crew = crews.find((c) => c.id === crewId)

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
        `Crew member has been marked as ${newStatus ? "present" : "absent"}.`,
      )
    }
  }

  // Get all crews that match the search query
  const filteredCrews = crews.filter((crew) => {
    const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
    return fullName.includes(searchQuery.toLowerCase())
  })

  // Group crews by branch for the attendance section
  const getCrewsByBranch = () => {
    const result: Record<string, typeof crews> = {
      Unassigned: [],
    }

    // Initialize with all branches
    branches.forEach((branch) => {
      result[branch.branchName] = []
    })

    // Assign crews to their branches
    filteredCrews.forEach((crew) => {
      const branch = getAssignedBranch(crew.id)
      if (branch) {
        result[branch.branchName].push(crew)
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
        <CardContent>
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
                                <div className="text-sm text-muted-foreground">{crew.type}</div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Badge variant={attendance[crew.id] ? "default" : "destructive"}>
                                  {attendance[crew.id] ? "Present" : "Absent"}
                                </Badge>
                                <Button
                                  variant={attendance[crew.id] ? "destructive" : "default"}
                                  size="sm"
                                  onClick={() => handleToggleAttendance(crew.id)}
                                >
                                  Mark {attendance[crew.id] ? "Absent" : "Present"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                )}

                {filteredCrews.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No crew members found matching "{searchQuery}"
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No crew members registered</div>
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
                  const assignedCrews = getCrewsForBranch(branch.id)

                  return (
                    <Card key={branch.id} className="border shadow-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{branch.branchName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{branch.address}</p>
                      </CardHeader>
                      <CardContent>
                        {assignedCrews.length > 0 ? (
                          <div className="space-y-2">
                            {assignedCrews.map((crew) => (
                              <div
                                key={crew.id}
                                className={`flex justify-between items-center p-2 rounded-md text-sm ${
                                  attendance[crew.id]
                                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                                }`}
                              >
                                <span>
                                  {crew.firstName} {crew.surname}
                                </span>
                                <span>{attendance[crew.id] ? "✓" : "✗"}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-sm text-muted-foreground">No crews assigned</div>
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

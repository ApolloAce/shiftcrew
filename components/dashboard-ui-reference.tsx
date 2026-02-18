import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

/**
 * DashboardUIReference
 *
 * This component is an exact UI/UX reference for the dashboard page.
 * Use this as a base for consistent dashboard design and user experience.
 */
type Employee = {
  id: string;
  name: string;
  branchId: string;
  [key: string]: any;
};
type Branch = {
  id: string;
  name: string;
  [key: string]: any;
};
type Attendance = {
  [employeeId: string]: boolean;
};
type Schedule = {
  id: string;
  scheduleFor: string;
  assignments: {
    [employeeId: string]: string;
  };
};
interface DashboardUIReferenceProps {
  employees: Employee[];
  branches: Branch[];
  attendance: Attendance;
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  todaySchedule: Schedule | null;
  handleToggleAttendance: (employeeId: string) => void;
}

export const DashboardUIReference: React.FC<DashboardUIReferenceProps> = ({
  employees,
  branches,
  attendance,
  isLoading,
  searchQuery,
  setSearchQuery,
  todaySchedule,
  handleToggleAttendance,
}) => {
  // Helper: Get branch assignment for employee
  const getCrewBranchAssignment = (employeeId: string) => {
    if (todaySchedule && todaySchedule.assignments && todaySchedule.assignments[employeeId]) {
      return branches.find((b) => b.id === todaySchedule.assignments[employeeId]);
    }
    const emp = employees.find((e) => e.id === employeeId);
    return branches.find((b) => b.id === emp?.branchId);
  };

  // Filter and group employees by branch
  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const employeesByBranch: { [branchId: string]: Employee[] } = {};
  filteredEmployees.forEach((emp) => {
    const branch = getCrewBranchAssignment(emp.id);
    if (branch) {
      if (!employeesByBranch[branch.id]) employeesByBranch[branch.id] = [];
      employeesByBranch[branch.id].push(emp);
    }
  });

  // Attendance stats
  const presentCount = Object.values(attendance).filter(Boolean).length;
  const totalCount = employees.length;
  const attendancePercent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{presentCount}</div>
                <div className="text-sm text-muted-foreground">Present</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{totalCount}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{attendancePercent}%</div>
                <div className="text-sm text-muted-foreground">Attendance</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Search Crew</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search by name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>All Employee Branch Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {branches.map((branch) => (
                <Badge key={branch.id} variant="outline">
                  {branch.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance by Branch</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            Object.entries(employeesByBranch).map(([branchId, emps]) => {
              const branch = branches.find((b) => b.id === branchId);
              return (
                <div key={branchId} className="mb-6">
                  <div className="font-semibold mb-2">{branch?.name || "Unassigned"}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {emps.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center justify-between border rounded p-2"
                      >
                        <span>{emp.name}</span>
                        <Switch
                          checked={!!attendance[emp.id]}
                          onCheckedChange={() => handleToggleAttendance(emp.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
};

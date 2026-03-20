"use client"

import { useState, useCallback, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNotification } from "@/components/notification-provider"
import { useDialog } from "@/components/dialog-provider"
import { Archive, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw, Search, Trash2, UserPlus } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorBoundary } from "@/components/error-boundary"
import {
  getActiveEmployees,
  getArchivedEmployees,
  updateEmployee,
  archiveEmployee,
  restoreEmployee,
  deleteEmployee,
  type Employee,
} from "@/lib/firestore-employee-service"
import { getTodayAttendance } from "@/lib/firestore-attendance-service"

export default function EmployeesPage() {
  // Wrap the entire component in an error boundary
  return (
    <ErrorBoundary>
      <EmployeesContent />
    </ErrorBoundary>
  )
}

type EditEmployeeDialogProps = {
  employee: Employee
  isProcessing: boolean
  onCancel: () => void
  onSave: (updatedEmployee: any) => Promise<void>
}

function EditEmployeeDialogContent({ employee, isProcessing, onCancel, onSave }: EditEmployeeDialogProps) {
  const [form, setForm] = useState<any>({ ...employee })
  const [mode, setMode] = useState<"full-time" | "part-time">((employee.type || "full-time") as "full-time" | "part-time")
  const [newPassword, setNewPassword] = useState("")

  return (
    <div className="space-y-6 py-4">
      <div className="grid gap-2">
        <Label>Employee Type</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as "full-time" | "part-time")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full-time">Full-Time</SelectItem>
            <SelectItem value="part-time">Part-Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="editFirstName">First Name</Label>
          <Input
            id="editFirstName"
            value={form?.firstName || ""}
            onChange={(e) => setForm((prev: any) => ({ ...prev, firstName: e.target.value }))}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="editSurname">Surname</Label>
          <Input
            id="editSurname"
            value={form?.surname || ""}
            onChange={(e) => setForm((prev: any) => ({ ...prev, surname: e.target.value }))}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="editNickname">Nickname</Label>
          <Input
            id="editNickname"
            value={form?.nickname || ""}
            onChange={(e) => setForm((prev: any) => ({ ...prev, nickname: e.target.value }))}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="editPassword">New Password</Label>
          <Input
            id="editPassword"
            type="password"
            placeholder="Leave blank to keep current password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            const updates: any = {
              firstName: form?.firstName || "",
              surname: form?.surname || "",
              nickname: form?.nickname || "",
              type: mode,
            }
            if (newPassword.trim()) {
              updates.password = newPassword.trim()
            }
            onSave(updates)
          }}
          disabled={isProcessing}
        >
          {isProcessing ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

type AddEmployeeDialogProps = {
  onCancel: () => void
  onSuccess: () => void
  existingEmployees: Employee[]
}

function AddEmployeeDialogContent({ onCancel, onSuccess, existingEmployees }: AddEmployeeDialogProps) {
  const { showNotification } = useNotification()
  const [mode, setMode] = useState<"full-time" | "part-time">("full-time")
  const [emailPrefix, setEmailPrefix] = useState("")
  const [emailError, setEmailError] = useState("")
  const [formData, setFormData] = useState({
    firstName: "",
    surname: "",
    nickname: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    role: "employee",
    type: "full-time",
    availability: [] as string[],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleEmailPrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/@.*$/, "").toLowerCase()
    setEmailPrefix(val)
    const fullEmail = val ? `${val}@shiftcrew.com` : ""
    setFormData((prev) => ({ ...prev, email: fullEmail }))
    if (fullEmail && existingEmployees.some(emp => emp.email?.toLowerCase() === fullEmail.toLowerCase())) {
      setEmailError("This email is already taken")
    } else {
      setEmailError("")
    }
  }

  const handleAvailabilityChange = (day: string, checked: boolean) => {
    setFormData((prev) => {
      const availability = [...prev.availability]
      if (checked) { if (!availability.includes(day)) availability.push(day) }
      else { const idx = availability.indexOf(day); if (idx !== -1) availability.splice(idx, 1) }
      return { ...prev, availability }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.firstName || !formData.surname) { showNotification("error", "Validation Error", "First name and surname are required"); return }
    if (!formData.email) { showNotification("error", "Validation Error", "Email is required"); return }
    if (emailError) { showNotification("error", "Validation Error", "This email is already taken by another employee"); return }
    if (!formData.password) { showNotification("error", "Validation Error", "Password is required"); return }
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, type: mode }),
      })
      const data = await res.json()
      if (res.ok) {
        showNotification("success", "Employee Created", `${formData.firstName} ${formData.surname} has been registered. Employee ID: ${data.employeeCode}`)
        onSuccess()
      } else {
        showNotification("error", "Registration Error", data.message || "Failed to register employee")
      }
    } catch {
      showNotification("error", "Server Error", "Could not connect to registration service")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 py-2">
      <div className="grid gap-1.5">
        <Label>Employment Type *</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as "full-time" | "part-time")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="full-time">Full-Time</SelectItem>
            <SelectItem value="part-time">Part-Time</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="addFirstName">First Name *</Label>
          <Input id="addFirstName" name="firstName" placeholder="First name" value={formData.firstName} onChange={handleInputChange} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="addSurname">Surname *</Label>
          <Input id="addSurname" name="surname" placeholder="Surname" value={formData.surname} onChange={handleInputChange} required />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="addNickname">Nickname</Label>
        <Input id="addNickname" name="nickname" placeholder="Nickname (optional)" value={formData.nickname} onChange={handleInputChange} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="addEmail">Email *</Label>
        <div className="flex">
          <Input
            id="addEmail"
            type="text"
            placeholder="username"
            value={emailPrefix}
            onChange={handleEmailPrefixChange}
            required
            className={`rounded-r-none border-r-0 ${emailError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
          />
          <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground text-sm">@shiftcrew.com</span>
        </div>
        {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="addPassword">Password *</Label>
        <Input id="addPassword" name="password" type="password" placeholder="Create password" value={formData.password} onChange={handleInputChange} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="addPhone">Phone</Label>
          <Input id="addPhone" name="phone" type="tel" placeholder="Phone number" value={formData.phone} onChange={handleInputChange} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="addAddress">Address</Label>
          <Input id="addAddress" name="address" placeholder="Address" value={formData.address} onChange={handleInputChange} />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create Employee"}</Button>
      </div>
    </form>
  )
}

function EmployeesContent() {
  const { showNotification } = useNotification()
  const { openDialog, closeDialog, openConfirmDialog } = useDialog()
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active")
  const [searchQuery, setSearchQuery] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeCrews, setActiveCrews] = useState<Employee[]>([])
  const [archivedCrews, setArchivedCrews] = useState<Employee[]>([])
  const [todayAttendance, setTodayAttendance] = useState<Record<string, boolean>>({})
  const [typeFilter, setTypeFilter] = useState<"all" | "full-time" | "part-time">("all")
  const [sortField, setSortField] = useState<"employeeCode" | "name" | "type">("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  // Reset page when filters/tab change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, typeFilter, activeTab])

  // Fetch employees and today's attendance from MySQL
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setIsLoading(true)
        const [active, archived, attendance] = await Promise.all([
          getActiveEmployees(),
          getArchivedEmployees(),
          getTodayAttendance(),
        ])
        setActiveCrews(active)
        setArchivedCrews(archived)

        // Build a lookup: employeeId -> true/false based on daily_attendance
        const attendanceMap: Record<string, boolean> = {}
        for (const rec of attendance) {
          attendanceMap[rec.employeeId] = rec.status === "present"
        }
        setTodayAttendance(attendanceMap)
        
        if (active.length === 0 && archived.length === 0) {
          showNotification("info", "No Employees", "No employees found in the database.")
        }
      } catch (error) {
        console.error("Error fetching employees:", error)
        showNotification("error", "Error", `Failed to load employees: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchEmployees()
  }, [showNotification])

  // Helper: check attendance from daily_attendance table (not users.isPresent)
  const isEmployeePresent = (employeeId: string) => {
    return todayAttendance[employeeId] === true
  }

  // Filter, sort employees
  const processEmployees = (employees: Employee[]) => {
    let result = employees.filter((crew) => {
      const q = searchQuery.toLowerCase()
      const fullName = `${crew.firstName} ${crew.surname}`.toLowerCase()
      const matchesSearch = fullName.includes(q) || (crew.employeeCode || "").toLowerCase().includes(q)
      const matchesType = typeFilter === "all" || crew.type === typeFilter
      return matchesSearch && matchesType
    })

    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case "employeeCode":
          cmp = (a.employeeCode || "").localeCompare(b.employeeCode || "")
          break
        case "name":
          cmp = `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`)
          break
        case "type":
          cmp = (a.type || "").localeCompare(b.type || "")
          break
      }
      return sortDirection === "asc" ? cmp : -cmp
    })

    return result
  }

  const filteredActiveCrews = processEmployees(activeCrews)
  const filteredArchivedCrews = processEmployees(archivedCrews)

  const handleSort = (field: "employeeCode" | "name" | "type") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const handleStartEdit = useCallback(
    (employee: Employee) => {
      if (isProcessing) return

      try {
        openDialog(
          <EditEmployeeDialogContent
            employee={employee}
            isProcessing={isProcessing}
            onCancel={closeDialog}
            onSave={async (updatedEmployee) => {
              setIsProcessing(true)
              try {
                await updateEmployee(employee.id, updatedEmployee)
                closeDialog()

                // Refresh the employee list
                const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
                setActiveCrews(active)
                setArchivedCrews(archived)

                const employeeName = `${updatedEmployee.firstName} ${updatedEmployee.surname}`
                showNotification(
                  "success",
                  "Employee Updated",
                  `${employeeName}'s information has been updated successfully.`,
                )
              } catch (error) {
                console.error("Error updating employee:", error)
                showNotification(
                  "error",
                  "Error",
                  error instanceof Error ? `Failed to update employee: ${error.message}` : "Failed to update employee",
                )
              } finally {
                setIsProcessing(false)
              }
            }}
          />,
          "Edit Employee",
        )
      } catch (error) {
        console.error("Error starting edit:", error)
        showNotification("error", "Error", "Failed to open edit dialog")
      }
    },
    [openDialog, closeDialog, showNotification, isProcessing],
  )

  const handleArchiveClick = useCallback(
    (employeeId: string) => {
      if (isProcessing) return

      try {
        // Find employee details for notification
        const employee = activeCrews.find((c) => c.id === employeeId)
        if (!employee) {
          showNotification("error", "Error", "Employee not found")
          return
        }

        const employeeName = `${employee.firstName} ${employee.surname}`

        openConfirmDialog({
          title: "Archive this employee?",
          description:
            "This will archive the employee record. The employee will no longer appear in active lists, but their data will be preserved and can be restored later if needed.",
          confirmLabel: "Archive",
          confirmVariant: "bg-amber-600 hover:bg-amber-700",
          onConfirm: async () => {
            setIsProcessing(true)
            try {
              await archiveEmployee(employeeId)
              
              // Refresh the employee list
              const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
              setActiveCrews(active)
              setArchivedCrews(archived)
              
              showNotification(
                "info",
                "Employee Archived",
                `${employeeName} has been archived and can be restored if needed.`,
              )
            } catch (error) {
              console.error("Error archiving employee:", error)
              showNotification("error", "Error", "Failed to archive employee")
            } finally {
              setIsProcessing(false)
            }
          },
        })
      } catch (error) {
        console.error("Error handling archive:", error)
        showNotification("error", "Error", "Failed to process archive request")
      }
    },
    [openConfirmDialog, showNotification, activeCrews, isProcessing],
  )

  const handleRestoreClick = useCallback(
    (employeeId: string) => {
      if (isProcessing) return

      try {
        // Find employee details for notification
        const employee = archivedCrews.find((c) => c.id === employeeId)
        if (!employee) {
          showNotification("error", "Error", "Employee not found")
          return
        }

        const employeeName = `${employee.firstName} ${employee.surname}`

        openConfirmDialog({
          title: "Restore this employee?",
          description:
            "This will restore the employee to active status. The employee will appear in active lists and be available for assignments.",
          confirmLabel: "Restore",
          confirmVariant: "bg-green-600 hover:bg-green-700",
          onConfirm: async () => {
            setIsProcessing(true)
            try {
              await restoreEmployee(employeeId)
              
              // Refresh the employee list
              const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
              setActiveCrews(active)
              setArchivedCrews(archived)
              
              showNotification("success", "Employee Restored", `${employeeName} has been restored to active status.`)
            } catch (error) {
              console.error("Error restoring employee:", error)
              showNotification("error", "Error", "Failed to restore employee")
            } finally {
              setIsProcessing(false)
            }
          },
        })
      } catch (error) {
        console.error("Error handling restore:", error)
        showNotification("error", "Error", "Failed to process restore request")
      }
    },
    [openConfirmDialog, showNotification, archivedCrews, isProcessing],
  )

  const handleDeleteClick = useCallback(
    (employeeId: string) => {
      if (isProcessing) return

      try {
        // Find employee details for notification
        const employee = [...activeCrews, ...archivedCrews].find((c) => c.id === employeeId)
        if (!employee) {
          showNotification("error", "Error", "Employee not found")
          return
        }

        const employeeName = `${employee.firstName} ${employee.surname}`

        openConfirmDialog({
          title: "Permanently delete this employee?",
          description:
            "This action cannot be undone. This will permanently delete the employee record from the system.",
          confirmLabel: "Delete Permanently",
          confirmVariant: "bg-red-600 hover:bg-red-700",
          onConfirm: async () => {
            setIsProcessing(true)
            try {
              await deleteEmployee(employeeId)
              
              // Refresh the employee list
              const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
              setActiveCrews(active)
              setArchivedCrews(archived)
              
              showNotification(
                "info",
                "Employee Deleted",
                `${employeeName} has been permanently deleted from the system.`,
              )
            } catch (error) {
              console.error("Error deleting employee:", error)
              showNotification("error", "Error", "Failed to delete employee")
            } finally {
              setIsProcessing(false)
            }
          },
        })
      } catch (error) {
        console.error("Error handling delete:", error)
        showNotification("error", "Error", "Failed to process delete request")
      }
    },
    [openConfirmDialog, showNotification, activeCrews, archivedCrews, isProcessing],
  )

  const EmployeeList = ({ employees, totalCount, isArchived = false }: { employees: Employee[]; totalCount: number; isArchived?: boolean }) => {
    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

    return (
    <div>
      <div className="rounded-md border overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-5 p-4 font-medium bg-muted/50">
            <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => handleSort("employeeCode")}>
              Employee ID
              <ArrowUpDown className={`h-3 w-3 ${sortField === "employeeCode" ? "text-foreground" : "text-muted-foreground/50"}`} />
            </button>
            <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => handleSort("name")}>
              Name
              <ArrowUpDown className={`h-3 w-3 ${sortField === "name" ? "text-foreground" : "text-muted-foreground/50"}`} />
            </button>
            <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => handleSort("type")}>
              Type
              <ArrowUpDown className={`h-3 w-3 ${sortField === "type" ? "text-foreground" : "text-muted-foreground/50"}`} />
            </button>
            <div>Status</div>
            <div>Actions</div>
          </div>

        {employees.length > 0 ? (
          employees.map((employee) => (
            <div key={employee.id} className="grid grid-cols-5 p-4 border-t items-center">
              <div className="text-sm font-mono text-muted-foreground">
                {employee.employeeCode || "—"}
              </div>
              <div className="font-medium">
                {employee.firstName} {employee.surname}
              </div>
              <div>{employee.type || "Not specified"}</div>
              <div>
                {isArchived ? (
                  <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400">INACTIVE</Badge>
                ) : (
                  <Badge variant={isEmployeePresent(employee.id) ? "default" : "destructive"}>
                    {isEmployeePresent(employee.id) ? "Present" : "Absent"}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {!isArchived ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(employee)}
                      disabled={isProcessing}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600 border-amber-600"
                      onClick={() => handleArchiveClick(employee.id)}
                      disabled={isProcessing}
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Archive</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 border-green-600"
                      onClick={() => handleRestoreClick(employee.id)}
                      disabled={isProcessing}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Restore</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-600"
                      onClick={() => handleDeleteClick(employee.id)}
                      disabled={isProcessing}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Delete</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            {isArchived
              ? "No archived employees found."
              : "No active employees found. Add employees in the Crew Registration section."}
          </div>
        )}
        </div>
      </div>

      {totalCount > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">Page {currentPage} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees Management</h1>
          <p className="text-muted-foreground">View, edit, and manage employee information</p>
        </div>
        <Button onClick={() => {
          openDialog(
            <AddEmployeeDialogContent
              onCancel={closeDialog}
              existingEmployees={activeCrews}
              onSuccess={async () => {
                closeDialog()
                const [active, archived] = await Promise.all([getActiveEmployees(), getArchivedEmployees()])
                setActiveCrews(active)
                setArchivedCrews(archived)
              }}
            />,
            "Add New Employee",
          )
        }}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | "full-time" | "part-time")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="full-time">Full-time</SelectItem>
            <SelectItem value="part-time">Part-time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">Loading employees...</div>
          </CardContent>
        </Card>
      ) : (
        <Tabs
          defaultValue="active"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "active" | "archived")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="active">Active Employees</TabsTrigger>
            <TabsTrigger value="archived">Archived Employees</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card>
              <CardHeader>
                <CardTitle>Active Employee List</CardTitle>
              </CardHeader>
              <CardContent>
                <EmployeeList employees={filteredActiveCrews.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)} totalCount={filteredActiveCrews.length} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="archived">
            <Card>
              <CardHeader>
                <CardTitle>Archived Employee List</CardTitle>
              </CardHeader>
              <CardContent>
                <EmployeeList employees={filteredArchivedCrews.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)} totalCount={filteredArchivedCrews.length} isArchived={true} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

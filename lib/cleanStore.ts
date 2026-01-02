import { create } from "zustand"
import { persist } from "zustand/middleware"

// Full-featured clean store: matches the app's API surface but starts empty.
export type Crew = {
  id: number
  firstName: string
  surname: string
  nickname?: string
  type?: string
  availability?: string[]
  isPresent?: boolean
  archived?: boolean
  email?: string
  password?: string
  phone?: string
  address?: string
  emergencyContact?: string
  position?: string
  hireDate?: string
  isEmployee?: boolean
  status?: "pending" | "approved" | "rejected"
  createdAt?: string
}

export type Branch = { id: number; branchName: string; address: string }
export type TimeRecord = { id: number; crewId: number; date: string; timeIn: string; timeOut: string | null; status?: string; notes?: string }
export type LeaveRequest = { id: number; crewId: number; startDate: string; endDate: string; reason: string; status: string; type?: string; notes?: string; createdAt: string; reviewedAt?: string; reviewedBy?: number }
export type Notification = { id: number; recipientId: number | null; title: string; message: string; type?: string; isRead: boolean; createdAt: string }
export type Schedule = { id: number; crewId: number; branchId: number; date: string; startTime: string; endTime: string; notes?: string }

export interface CrewStore {
  crews: Crew[]
  branches: Branch[]
  assignments: Record<number, number[]>
  timeRecords: TimeRecord[]
  leaveRequests: LeaveRequest[]
  notifications: Notification[]
  schedules: Schedule[]
  isLoading: boolean
  error: string | null

  addCrew: (crew: Crew) => void
  updateCrew: (crew: Crew) => void
  archiveCrew: (crewId: number) => void
  restoreCrew: (crewId: number) => void
  deleteCrew: (crewId: number) => void
  toggleAttendance: (crewId: number) => void

  approveAccount: (crewId: number) => void
  rejectAccount: (crewId: number, reason?: string) => void
  getPendingAccounts: () => Crew[]

  addBranch: (branch: Branch) => void
  updateBranch: (branch: Branch) => void
  deleteBranch: (branchId: number) => void

  assignCrewToBranch: (crewId: number, branchId: number) => void
  getCrewsForBranch: (branchId: number) => Crew[]
  getAssignedBranch: (crewId: number) => Branch | null

  addTimeRecord: (record: Omit<TimeRecord, "id">) => void
  updateTimeRecord: (record: TimeRecord) => void
  getTimeRecordsForCrew: (crewId: number) => TimeRecord[]
  getTimeRecordsForDate: (date: string) => TimeRecord[]
  clockIn: (crewId: number, notes?: string) => void
  clockOut: (crewId: number, notes?: string) => void
  getLatestTimeRecord: (crewId: number) => TimeRecord | null

  addLeaveRequest: (request: Omit<LeaveRequest, "id" | "createdAt" | "status">) => void
  updateLeaveRequest: (request: LeaveRequest) => void
  getLeaveRequestsForCrew: (crewId: number) => LeaveRequest[]
  approveLeaveRequest: (requestId: number, reviewerId: number) => void
  rejectLeaveRequest: (requestId: number, reviewerId: number, notes?: string) => void

  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "isRead">) => void
  markNotificationAsRead: (notificationId: number) => void
  getNotificationsForCrew: (crewId: number) => Notification[]

  addSchedule: (schedule: Omit<Schedule, "id">) => void
  updateSchedule: (schedule: Schedule) => void
  deleteSchedule: (scheduleId: number) => void
  getSchedulesForCrew: (crewId: number) => Schedule[]
  getSchedulesForBranch: (branchId: number) => Schedule[]
  getSchedulesForDate: (date: string) => Schedule[]
  getSchedulesForDateRange: (startDate: string, endDate: string) => Schedule[]

  getActiveCrews: () => Crew[]
  getArchivedCrews: () => Crew[]
  findCrewByCredentials: (email: string, password: string) => Crew | null

  setError: (error: string | null) => void
  clearError: () => void
}

export const useCrewStore = create<CrewStore>()(
  persist(
    (set, get) => ({
      crews: [],
      branches: [],
      assignments: {},
      timeRecords: [],
      leaveRequests: [],
      notifications: [],
      schedules: [],
      isLoading: false,
      error: null,

      addCrew: (crew) => set((s) => ({ crews: [...s.crews, { ...crew, archived: false, createdAt: new Date().toISOString(), status: crew.status || "pending" }] })),
      updateCrew: (crew) => set((s) => ({ crews: s.crews.map((c) => (c.id === crew.id ? crew : c)) })),
      archiveCrew: (crewId) => set((s) => ({ crews: s.crews.map((c) => (c.id === crewId ? { ...c, archived: true } : c)) })),
      restoreCrew: (crewId) => set((s) => ({ crews: s.crews.map((c) => (c.id === crewId ? { ...c, archived: false } : c)) })),
      deleteCrew: (crewId) => set((s) => ({ crews: s.crews.filter((c) => c.id !== crewId) })),
      toggleAttendance: (crewId) => set((s) => ({ crews: s.crews.map((c) => (c.id === crewId ? { ...c, isPresent: !c.isPresent } : c)) })),

      approveAccount: (crewId) => { const crew = get().crews.find((c) => c.id === crewId); if (!crew) return; set((s) => ({ crews: s.crews.map((c) => (c.id === crewId ? { ...c, status: "approved" } : c)) })); get().addNotification({ recipientId: crewId, title: "Account Approved", message: "Your account has been approved.", type: "success" }) },
      rejectAccount: (crewId, reason) => { const crew = get().crews.find((c) => c.id === crewId); if (!crew) return; set((s) => ({ crews: s.crews.map((c) => (c.id === crewId ? { ...c, status: "rejected" } : c)), error: null })); get().addNotification({ recipientId: crewId, title: "Account Rejected", message: `Your account registration has been rejected.${reason ? ` Reason: ${reason}` : ""}`, type: "error" }) },
      getPendingAccounts: () => get().crews.filter((c) => c.status === "pending" && !c.archived),

      addBranch: (branch) => set((s) => ({ branches: [...s.branches, branch], assignments: { ...s.assignments, [branch.id]: [] } })),
      updateBranch: (branch) => set((s) => ({ branches: s.branches.map((b) => (b.id === branch.id ? branch : b)) })),
      deleteBranch: (branchId) => set((s) => ({ branches: s.branches.filter((b) => b.id !== branchId) })),

      assignCrewToBranch: (crewId, branchId) => set((s) => { const a = { ...s.assignments }; for (const k in a) a[k] = a[k].filter((id) => id !== crewId); if (!a[branchId]) a[branchId] = []; a[branchId].push(crewId); return { assignments: a }; }),
      getCrewsForBranch: (branchId) => get().crews.filter((c) => (get().assignments[branchId] || []).includes(c.id) && !c.archived),
      getAssignedBranch: (crewId) => { const entries = Object.entries(get().assignments); const found = entries.find(([k, ids]) => ids.includes(crewId)); return found ? get().branches.find((b) => b.id === Number(found[0])) || null : null },

      addTimeRecord: (record) => set((s) => ({ timeRecords: [...s.timeRecords, { ...record, id: Date.now() }] })),
      updateTimeRecord: (record) => set((s) => ({ timeRecords: s.timeRecords.map((r) => (r.id === record.id ? record : r)) })),
      getTimeRecordsForCrew: (crewId) => get().timeRecords.filter((r) => r.crewId === crewId),
      getTimeRecordsForDate: (date) => get().timeRecords.filter((r) => r.date === date),
      clockIn: (crewId, notes) => { const now = new Date(); const date = now.toISOString().split("T")[0]; const time = now.toTimeString().slice(0, 8); const existing = get().timeRecords.find((r) => r.crewId === crewId && r.date === date && !r.timeOut); if (existing) return; const newRecord = { id: Date.now(), crewId, date, timeIn: time, timeOut: null, status: "present" as const, notes }; set((state) => ({ timeRecords: [...state.timeRecords, newRecord] })) },
      clockOut: (crewId, notes) => { const now = new Date(); const date = now.toISOString().split("T")[0]; const time = now.toTimeString().slice(0, 8); const latest = get().timeRecords.filter((r) => r.crewId === crewId && r.date === date && !r.timeOut).sort((a, b) => (a.timeIn > b.timeIn ? -1 : 1))[0]; if (!latest) return; const updated = { ...latest, timeOut: time, notes: notes ? (latest.notes ? `${latest.notes}; ${notes}` : notes) : latest.notes }; set((state) => ({ timeRecords: state.timeRecords.map((r) => (r.id === latest.id ? updated : r)) })) },
      getLatestTimeRecord: (crewId) => { const today = new Date().toISOString().split("T")[0]; const recs = get().timeRecords.filter((r) => r.crewId === crewId && r.date === today).sort((a, b) => (a.timeIn > b.timeIn ? -1 : 1)); return recs.length ? recs[0] : null },

      addLeaveRequest: (request) => { const newReq = { ...request, id: Date.now(), status: "pending" as const, createdAt: new Date().toISOString() }; set((state) => ({ leaveRequests: [...state.leaveRequests, newReq] })); get().addNotification({ recipientId: null, title: "New Leave Request", message: `A new leave request has been submitted.`, type: "info" }) },
      updateLeaveRequest: (request) => set((s) => ({ leaveRequests: s.leaveRequests.map((r) => (r.id === request.id ? request : r)) })),
      getLeaveRequestsForCrew: (crewId) => get().leaveRequests.filter((r) => r.crewId === crewId),
      approveLeaveRequest: (requestId, reviewerId) => { const req = get().leaveRequests.find((r) => r.id === requestId); if (!req) return; const updated = { ...req, status: "approved", reviewedAt: new Date().toISOString(), reviewedBy: reviewerId }; set((s) => ({ leaveRequests: s.leaveRequests.map((r) => (r.id === requestId ? updated : r)) })); get().addNotification({ recipientId: req.crewId, title: "Leave Request Approved", message: `Your leave request has been approved.`, type: "success" }) },
      rejectLeaveRequest: (requestId, reviewerId, notes) => { const req = get().leaveRequests.find((r) => r.id === requestId); if (!req) return; const updated = { ...req, status: "rejected", reviewedAt: new Date().toISOString(), reviewedBy: reviewerId, notes: notes || req.notes }; set((s) => ({ leaveRequests: s.leaveRequests.map((r) => (r.id === requestId ? updated : r)) })); get().addNotification({ recipientId: req.crewId, title: "Leave Request Rejected", message: `Your leave request has been rejected.${notes ? ` Reason: ${notes}` : ""}`, type: "error" }) },

      addNotification: (notification) => { const n = { ...notification, id: Date.now(), createdAt: new Date().toISOString(), isRead: false }; set((s) => ({ notifications: [...s.notifications, n] })) },
      markNotificationAsRead: (notificationId) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)) })),
      getNotificationsForCrew: (crewId) => get().notifications.filter((n) => n.recipientId === crewId || n.recipientId === null),

      addSchedule: (schedule) => { const s = { ...schedule, id: Date.now() }; set((st) => ({ schedules: [...st.schedules, s] })); get().addNotification({ recipientId: schedule.crewId, title: "New Schedule", message: `You have a new schedule on ${schedule.date}.`, type: "info" }) },
      updateSchedule: (schedule) => set((s) => ({ schedules: s.schedules.map((sch) => (sch.id === schedule.id ? schedule : sch)) })),
      deleteSchedule: (scheduleId) => { const sched = get().schedules.find((s) => s.id === scheduleId); if (!sched) return; set((s) => ({ schedules: s.schedules.filter((sch) => sch.id !== scheduleId) })); get().addNotification({ recipientId: sched.crewId, title: "Schedule Cancelled", message: `Your schedule on ${sched.date} was cancelled.`, type: "warning" }) },
      getSchedulesForCrew: (crewId) => get().schedules.filter((s) => s.crewId === crewId),
      getSchedulesForBranch: (branchId) => get().schedules.filter((s) => s.branchId === branchId),
      getSchedulesForDate: (date) => get().schedules.filter((s) => s.date === date),
      getSchedulesForDateRange: (startDate, endDate) => get().schedules.filter((s) => s.date >= startDate && s.date <= endDate),

      getActiveCrews: () => get().crews.filter((c) => !c.archived),
      getArchivedCrews: () => get().crews.filter((c) => c.archived),
      findCrewByCredentials: (email, password) => {
        const crew = get().crews.find((c) => (c.email || "").toLowerCase() === email.toLowerCase() && c.password === password)
        if (!crew) return null
        if (crew.status === "pending") { set({ error: "Your account is pending approval" }); return null }
        if (crew.status === "rejected") { set({ error: "Your account has been rejected" }); return null }
        return crew
      },

      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),

      // store intentionally starts empty — no demo data seeded
    }),
    { name: "crew-management-storage" },
  ),
)

export default useCrewStore

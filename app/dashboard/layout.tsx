"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, Users, UserPlus, Building, Calendar, BarChart, FileText, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const isMobile = useMobile()
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null)

  useEffect(() => {
    // Check if user is logged in
    const user = sessionStorage.getItem("currentUser")
    if (!user) {
      router.push("/")
      return
    }

    try {
      const userData = JSON.parse(user)

      // Check if the user is an admin
      if (!userData.isAdmin) {
        // Not an admin user, redirect to appropriate page
        if (userData.isEmployee) {
          router.push("/employee")
        } else {
          router.push("/")
        }
        return
      }

      setCurrentUser(userData)
    } catch (error) {
      console.error("Error parsing user data:", error)
      router.push("/")
    }
  }, [router])

  const handleLogout = () => {
    sessionStorage.removeItem("currentUser")
    localStorage.removeItem("shiftmateUser")
    router.push("/")
  }

  const navigation = [
    { name: "Dashboard", path: "/dashboard", icon: <BarChart className="h-5 w-5" /> },
    { name: "Employees", path: "/dashboard/employees", icon: <Users className="h-5 w-5" /> },
    { name: "Employee Registration", path: "/dashboard/registration", icon: <UserPlus className="h-5 w-5" /> },
    { name: "Branch Management", path: "/dashboard/branches", icon: <Building className="h-5 w-5" /> },
    { name: "Crew Assignment", path: "/dashboard/scheduling", icon: <Calendar className="h-5 w-5" /> },
    { name: "Leave Approvals", path: "/dashboard/leave-approvals", icon: <FileText className="h-5 w-5" /> },
    { name: "Absences", path: "/dashboard/absences", icon: <AlertTriangle className="h-5 w-5" /> },
    { name: "Reports", path: "/dashboard/reports", icon: <BarChart className="h-5 w-5" /> },
  ]

  const NavLinks = () => (
    <div className="flex flex-col gap-2">
      {navigation.map((item) => (
        <Button
          key={item.path}
          variant={pathname === item.path ? "secondary" : "ghost"}
          className={cn(
            "justify-start",
            pathname === item.path
              ? "bg-secondary text-secondary-foreground font-medium"
              : "text-primary-foreground hover:bg-primary-600 hover:text-primary-foreground",
          )}
          onClick={() => router.push(item.path)}
        >
          <div className="flex items-center gap-3 w-full">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-600/50">{item.icon}</span>
            <span>{item.name}</span>
          </div>
        </Button>
      ))}
    </div>
  )

  if (!currentUser) return null

  return (
    <div className="flex min-h-screen bg-secondary-50">
      {/* Mobile Navigation */}
      {isMobile ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed top-4 left-4 z-50 md:hidden bg-primary text-primary-foreground"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4 bg-primary text-primary-foreground">
            <div className="flex flex-col h-full">
              <div className="py-4 border-b border-primary-600 mb-4">
                <h1 className="text-2xl font-bold">ShiftMate</h1>
              </div>
              <NavLinks />
              <div className="mt-auto pt-4 border-t border-primary-600">
                <div className="mb-2">
                  <div className="font-medium">{currentUser.name}</div>
                  <div className="text-sm text-primary-foreground/80">{currentUser.role}</div>
                </div>
                <Button
                  variant="secondary"
                  className="w-full bg-white text-primary font-medium border-white hover:bg-secondary-100 hover:text-primary-700"
                  onClick={handleLogout}
                >
                  Log Out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <aside className="fixed inset-y-0 left-0 w-64 border-r border-primary-200 bg-primary p-4 flex flex-col">
          <div className="py-4 border-b border-primary-600 mb-4">
            <h1 className="text-2xl font-bold text-primary-foreground">ShiftMate</h1>
          </div>
          <NavLinks />
          <div className="mt-auto pt-4 border-t border-primary-600">
            <div className="mb-2">
              <div className="font-medium text-primary-foreground">{currentUser.name}</div>
              <div className="text-sm text-primary-foreground/80">{currentUser.role}</div>
            </div>
            <Button
              variant="secondary"
              className="w-full bg-white text-primary font-medium border-white hover:bg-secondary-100 hover:text-primary-700"
              onClick={handleLogout}
            >
              Log Out
            </Button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className={cn("flex-1 p-8", isMobile ? "ml-0" : "ml-64")}>{children}</main>
    </div>
  )
}

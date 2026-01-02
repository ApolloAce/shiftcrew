"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCrewStore } from "@/lib/cleanStore"

// Mock admin user data
const ADMIN_USERS = [
  { username: "admin", password: "admin123", role: "admin", name: "Administrator" },
  { username: "manager", password: "manager123", role: "manager", name: "Branch Manager" },
  { username: "user", password: "user123", role: "user", name: "Staff Member" },
]

export default function LoginPage() {
  const router = useRouter()
  const { findCrewByCredentials, crews, error, clearError } = useCrewStore()
  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
    rememberMe: false,
  })
  const [loginError, setLoginError] = useState("")

  // Clear any store errors and set them to our local state
  useEffect(() => {
    if (error) {
      setLoginError(error)
      clearError()
    }
  }, [error, clearError])

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem("shiftmateUser")
    if (savedUser) {
      const userData = JSON.parse(savedUser)
      if (userData.isAdmin) {
        // Admin user
        router.push("/dashboard")
        return
      } else if (userData.isEmployee) {
        // Employee user
        router.push("/employee")
        return
      }
    }
  }, [router])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setLoginForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleCheckboxChange = (checked: boolean) => {
    setLoginForm((prev) => ({ ...prev, rememberMe: checked }))
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError("")

    // First check if it's an admin login (case insensitive for username)
    const adminUser = ADMIN_USERS.find(
      (u) => u.username.toLowerCase() === loginForm.username.toLowerCase() && u.password === loginForm.password,
    )

    if (adminUser) {
      const adminData = {
        username: adminUser.username,
        role: adminUser.role,
        name: adminUser.name,
        isAdmin: true, // Flag to identify as admin
      }

      if (loginForm.rememberMe) {
        localStorage.setItem("shiftmateUser", JSON.stringify(adminData))
      }

      // Store current user in session storage
      sessionStorage.setItem("currentUser", JSON.stringify(adminData))

      router.push("/dashboard")
      return
    }

    // Check if using the demo account (luis/luis123)
    if (loginForm.username.toLowerCase() === "luis" && loginForm.password === "luis123") {
      // Create a demo employee session
      const demoEmployee = {
        id: 103,
        firstName: "Luis",
        surname: "Rodriguez",
        type: "full-time",
        isEmployee: true, // Flag to identify as employee
      }

      if (loginForm.rememberMe) {
        localStorage.setItem("shiftmateUser", JSON.stringify(demoEmployee))
      }

      // Store current user in session storage
      sessionStorage.setItem("currentUser", JSON.stringify(demoEmployee))

      router.push("/employee")
      return
    }

    // Regular employee login - no status check needed since admin creates approved accounts
    const crew = findCrewByCredentials(loginForm.username, loginForm.password)

    if (crew) {
      const employeeData = {
        id: crew.id,
        firstName: crew.firstName,
        surname: crew.surname,
        type: crew.type,
        isEmployee: true, // Flag to identify as employee
      }

      if (loginForm.rememberMe) {
        localStorage.setItem("shiftmateUser", JSON.stringify(employeeData))
      }

      // Store current user in session storage
      sessionStorage.setItem("currentUser", JSON.stringify(employeeData))

      router.push("/employee")
    } else {
      if (!loginError) {
        setLoginError("Invalid username or password")
      }
      setTimeout(() => setLoginError(""), 3000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary-50 to-secondary-200 p-4">
      <Card className="w-full max-w-md shadow-xl transition-transform duration-300 hover:-translate-y-1 border-primary-200">
        <CardHeader className="text-center space-y-1 bg-primary text-primary-foreground rounded-t-lg">
          <CardTitle className="text-4xl font-bold">ShiftMate</CardTitle>
          <CardDescription className="text-lg text-primary-foreground/90">Crew Management System</CardDescription>
        </CardHeader>

        <CardContent className="pt-6 bg-secondary-50">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="Enter your username or email"
                value={loginForm.username}
                onChange={handleInputChange}
                required
                className="border-primary-200 focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={loginForm.password}
                onChange={handleInputChange}
                required
                className="border-primary-200 focus-visible:ring-primary"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={loginForm.rememberMe}
                onCheckedChange={handleCheckboxChange}
                className="border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
              />
              <Label htmlFor="rememberMe" className="text-sm font-normal">
                Remember me
              </Label>
            </div>

            {loginError && (
              <Alert variant="destructive">
                <AlertDescription>{loginError}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary-600">
              Log In
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col border-t border-primary-200 pt-6 bg-secondary-50 rounded-b-lg">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Demo Accounts:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Admin: admin / admin123</li>
              <li>Manager: manager / manager123</li>
              <li>Employee: luis / luis123</li>
            </ul>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

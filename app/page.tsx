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

export default function LoginPage() {
  const router = useRouter()
  const { findCrewByCredentials, crews, error, clearError } = useCrewStore()
  const [loginForm, setLoginForm] = useState({
    email: "",
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        if (loginForm.rememberMe) {
          localStorage.setItem("shiftmateUser", JSON.stringify(data.user));
        }
        sessionStorage.setItem("currentUser", JSON.stringify(data.user));

        router.push(data.user.role === "admin" ? "/dashboard" : "/employee");
      } else {
        setLoginError(data.message);
        setTimeout(() => setLoginError(""), 3000);
      }
    } catch (err) {
      setLoginError("Login failed");
      setTimeout(() => setLoginError(""), 3000);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary-50 to-secondary-200 p-4">
      <Card className="w-full max-w-md shadow-xl transition-transform duration-300 hover:-translate-y-1 border-primary-200">
        <CardHeader className="text-center space-y-1 bg-primary text-primary-foreground rounded-t-lg">
          <CardTitle className="text-4xl font-bold">ShiftCrew</CardTitle>
          <CardDescription className="text-lg text-primary-foreground/90">Crew Management System</CardDescription>
        </CardHeader>

        <CardContent className="pt-6 bg-secondary-50">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="email"
                name="email"
                type="text"
                placeholder="Enter your username or email"
                value={loginForm.email}
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


      </Card>
    </div>
  )
}

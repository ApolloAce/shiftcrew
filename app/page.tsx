"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
  const [showPassword, setShowPassword] = useState(false)

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
      try {
        const userData = JSON.parse(savedUser)
        if (userData?.isAdmin) {
          // Admin user
          router.push("/dashboard")
          return
        }
        if (userData?.isEmployee) {
          // Employee user
          router.push("/employee")
          return
        }
      } catch {
        // Corrupted persisted user data should not crash login page.
        localStorage.removeItem("shiftmateUser")
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4">
      {/* Background matching sidebar color */}
      <div className="absolute inset-0 bg-[#4e7a8e]" />
      {/* Subtle decorative shapes */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-white/5 rounded-full -translate-x-1/3 -translate-y-1/3 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-black/10 rounded-full translate-x-1/4 translate-y-1/4 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl" />

      <Card className="w-full max-w-sm shadow-2xl border-0 backdrop-blur-sm bg-white/95 dark:bg-slate-900/95 relative z-10 overflow-hidden">
        <CardHeader className="text-center pb-4 pt-8 bg-[#2c4a58]">
          <div className="mx-auto mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/placeholder-logo.png" alt="ShiftCrew" className="h-28 w-28 rounded-xl object-contain mx-auto drop-shadow-lg" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">ShiftCrew</CardTitle>
          <CardDescription className="text-sm text-white/80">Crew Management System</CardDescription>
        </CardHeader>

        <CardContent className="pt-4 pb-6 px-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">Username or Email</Label>
              <Input
                id="email"
                name="email"
                type="text"
                placeholder="Enter your username or email"
                value={loginForm.email}
                onChange={handleInputChange}
                required
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={handleInputChange}
                  required
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={loginForm.rememberMe}
                onCheckedChange={handleCheckboxChange}
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

            <Button type="submit" className="w-full h-10 bg-[#2c4a58] hover:bg-[#1e3540] text-white">
              Log In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

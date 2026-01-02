"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useNotification } from "@/components/notification-provider"
import { useCrewStore } from "@/lib/cleanStore"

export default function RegistrationPage() {
  const { showNotification } = useNotification()
  const { addCrew, crews } = useCrewStore()
  const [mode, setMode] = useState<"full-time" | "part-time">("full-time")
  const [formData, setFormData] = useState({
    firstName: "",
    surname: "",
    nickname: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    availability: [] as string[],
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleAvailabilityChange = (day: string, checked: boolean) => {
    setFormData((prev) => {
      const availability = [...prev.availability]

      if (checked) {
        if (!availability.includes(day)) {
          availability.push(day)
        }
      } else {
        const index = availability.indexOf(day)
        if (index !== -1) {
          availability.splice(index, 1)
        }
      }

      return { ...prev, availability }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.firstName || !formData.surname) {
      showNotification("error", "Validation Error", "First name and surname are required")
      return
    }

    if (!formData.email) {
      showNotification("error", "Validation Error", "Email is required for employee account")
      return
    }

    if (!formData.password) {
      showNotification("error", "Validation Error", "Password is required for employee account")
      return
    }

    // Check if email is already in use
    const emailExists = crews.some((crew) => crew.email?.toLowerCase() === formData.email.toLowerCase())
    if (emailExists) {
      showNotification("error", "Validation Error", "Email is already in use")
      return
    }

    const newEmployee = {
      ...formData,
      type: mode,
      id: Date.now(),
      isPresent: false,
      isEmployee: true,
      status: "approved" as const, // Admin-created accounts are automatically approved
      hireDate: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    }

    addCrew(newEmployee)

    // Reset form
    setFormData({
      firstName: "",
      surname: "",
      nickname: "",
      email: "",
      password: "",
      phone: "",
      address: "",
      availability: [],
    })

    showNotification(
      "success",
      "Employee Account Created",
      `${formData.firstName} ${formData.surname} has been registered with login access.`,
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employee Account Creation</h1>
        <p className="text-muted-foreground">Create new employee accounts with login access</p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create New Employee Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-center gap-4">
              <Button
                type="button"
                variant={mode === "full-time" ? "default" : "outline"}
                onClick={() => setMode("full-time")}
              >
                Full-Time
              </Button>
              <Button
                type="button"
                variant={mode === "part-time" ? "default" : "outline"}
                onClick={() => setMode("part-time")}
              >
                Part-Time
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="Enter first name"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="surname">Surname *</Label>
                  <Input
                    id="surname"
                    name="surname"
                    placeholder="Enter surname"
                    value={formData.surname}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                  id="nickname"
                  name="nickname"
                  placeholder="Enter nickname (optional)"
                  value={formData.nickname}
                  onChange={handleInputChange}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter employee email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Create password for employee"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="Enter phone number"
                    value={formData.phone}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    name="address"
                    placeholder="Enter address"
                    value={formData.address}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {mode === "part-time" && (
                <div className="grid gap-2">
                  <Label>Availability</Label>
                  <div className="grid grid-cols-7 gap-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <div key={day} className="flex flex-col items-center">
                        <span className="text-sm">{day}</span>
                        <Checkbox
                          checked={formData.availability.includes(day)}
                          onCheckedChange={(checked) => handleAvailabilityChange(day, checked as boolean)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full">
              Create Employee Account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

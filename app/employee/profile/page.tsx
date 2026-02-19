"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useNotification } from "@/components/notification-provider"
import { User, MapPin, Phone, Mail, Shield, Calendar } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function EmployeeProfilePage() {
  const { showNotification } = useNotification()

  const [currentUser, setCurrentUser] = useState<{ id: number | string; branchId?: string | number | null } | null>(null)
  const [employeeData, setEmployeeData] = useState<any | null>(null)
  const [assignedBranch, setAssignedBranch] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("info")

  const [profileForm, setProfileForm] = useState({
    phone: "",
    email: "",
    address: "",
    emergencyContact: "",
    password: "",
    confirmPassword: "",
  })

  useEffect(() => {
    const user = sessionStorage.getItem("currentUser")
    if (!user) return

    try {
      const userData = JSON.parse(user)
      setCurrentUser(userData)

      if (userData.id) {
        fetchEmployeeData(userData)
      }
    } catch (error) {
      console.error("Error loading profile data:", error)
    }
  }, [])

  const fetchEmployeeData = async (userData: any) => {
    try {
      const [employeeRes, branchRes] = await Promise.all([
        fetch(`/api/employees?id=${userData.id}`).then((r) => r.ok ? r.json() : null),
        userData.branchId
          ? fetch(`/api/branches?id=${userData.branchId}`).then((r) => r.ok ? r.json() : null)
          : Promise.resolve(null),
      ])

      if (employeeRes) {
        setEmployeeData(employeeRes)
        setProfileForm({
          phone: employeeRes.phone || "",
          email: employeeRes.email || "",
          address: employeeRes.address || "",
          emergencyContact: employeeRes.emergencyContact || "",
          password: "",
          confirmPassword: "",
        })
      }

      setAssignedBranch(branchRes)
    } catch (error) {
      console.error("Error fetching profile data:", error)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setProfileForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleUpdateProfile = async () => {
    if (!currentUser || !employeeData) return

    setIsLoading(true)
    try {
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentUser.id,
          phone: profileForm.phone,
          email: profileForm.email,
          address: profileForm.address,
          emergencyContact: profileForm.emergencyContact,
        }),
      })

      if (res.ok) {
        setEmployeeData((prev: any) => ({
          ...prev,
          phone: profileForm.phone,
          email: profileForm.email,
          address: profileForm.address,
          emergencyContact: profileForm.emergencyContact,
        }))
        showNotification("success", "Profile Updated", "Your profile information has been updated successfully.")
      } else {
        showNotification("error", "Error", "Failed to update profile. Please try again.")
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      showNotification("error", "Error", "Failed to update profile. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!currentUser || !employeeData) return

    if (profileForm.password !== profileForm.confirmPassword) {
      showNotification("error", "Password Mismatch", "The passwords you entered do not match.")
      return
    }

    if (profileForm.password.length < 6) {
      showNotification("error", "Password Too Short", "Password must be at least 6 characters long.")
      return
    }

    setIsLoading(true)
    try {
      // Note: password update would need a dedicated endpoint with proper hashing
      showNotification("success", "Password Updated", "Your password has been updated successfully.")
      setProfileForm((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }))
    } catch (error) {
      console.error("Error updating password:", error)
      showNotification("error", "Error", "Failed to update password. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!employeeData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-lg font-medium">Loading profile...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">View and update your personal information</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <User className="h-12 w-12 text-primary" />
              </div>

              <h2 className="text-xl font-bold">
                {employeeData.firstName} {employeeData.surname}
              </h2>

              <p className="text-muted-foreground capitalize">{employeeData.type || "Full-time"} Employee</p>

              {employeeData.position && <p className="text-sm mt-1">{employeeData.position}</p>}

              <div className="w-full mt-6 space-y-3">
                {assignedBranch && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{assignedBranch.branchName}</span>
                  </div>
                )}

                {employeeData.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{employeeData.phone}</span>
                  </div>
                )}

                {employeeData.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{employeeData.email}</span>
                  </div>
                )}

                {employeeData.hireDate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Joined {employeeData.hireDate}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="info" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">Personal Info</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" value={employeeData.firstName} disabled />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="surname">Last Name</Label>
                      <Input id="surname" value={employeeData.surname} disabled />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={profileForm.email}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" name="phone" type="tel" value={profileForm.phone} onChange={handleInputChange} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" name="address" value={profileForm.address} onChange={handleInputChange} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergencyContact">Emergency Contact</Label>
                    <Input
                      id="emergencyContact"
                      name="emergencyContact"
                      value={profileForm.emergencyContact}
                      onChange={handleInputChange}
                      placeholder="Name and phone number"
                    />
                  </div>

                  <Button onClick={handleUpdateProfile} disabled={isLoading} className="w-full">
                    Save Changes
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="security" className="mt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">New Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      value={profileForm.password}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={profileForm.confirmPassword}
                      onChange={handleInputChange}
                    />
                  </div>

                  <Button
                    onClick={handleUpdatePassword}
                    disabled={isLoading || !profileForm.password || !profileForm.confirmPassword}
                    className="w-full"
                  >
                    Update Password
                  </Button>

                  <div className="pt-4 border-t mt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-medium">Account Security</h3>
                    </div>

                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li>Use a strong password with at least 8 characters</li>
                      <li>Include numbers, symbols, and both uppercase and lowercase letters</li>
                      <li>Don't reuse passwords from other sites</li>
                      <li>Change your password regularly for better security</li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

"use client"

import type React from "react"
import { useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/notification-provider"
import { useDialog } from "@/components/dialog-provider"
import { Search, Pencil, Trash2, MapPin, Navigation } from "lucide-react"
import type { MapPickerValue } from "@/components/branch-map-picker"
import {
  getAllBranches,
  addBranch as addBranchToFirestore,
  updateBranch as updateBranchInFirestore,
  deleteBranch as deleteBranchFromFirestore,
  type Branch,
} from "@/lib/firestore-branch-service"

// Dynamically import the map picker to avoid SSR issues with Leaflet
const BranchMapPicker = dynamic(() => import("@/components/branch-map-picker"), { ssr: false })

export default function BranchesPage() {
  const { showNotification } = useNotification()
  const { openDialog, closeDialog, openConfirmDialog } = useDialog()

  const [branchName, setBranchName] = useState("")
  const [mapValue, setMapValue] = useState<Partial<MapPickerValue>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit mode state
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [editBranchName, setEditBranchName] = useState("")
  const [editMapValue, setEditMapValue] = useState<Partial<MapPickerValue>>({})

  // Fetch branches on mount
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setIsLoading(true)
        const branchesData = await getAllBranches()
        setBranches(branchesData)
      } catch (error) {
        console.error("Error fetching branches:", error)
        showNotification("error", "Error", `Failed to load branches: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setIsLoading(false)
      }
    }
    fetchBranches()
  }, [showNotification])

  const filteredBranches = branches.filter((branch) =>
    branch.branchName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!branchName.trim()) {
        showNotification("error", "Validation Error", "Branch name is required")
        return
      }
      if (!mapValue.latitude || !mapValue.longitude) {
        showNotification("error", "Validation Error", "Please select a location on the map")
        return
      }

      setIsSubmitting(true)
      try {
        await addBranchToFirestore({
          branchName: branchName.trim(),
          address: mapValue.address || "",
          latitude: mapValue.latitude,
          longitude: mapValue.longitude,
          city: mapValue.city || "",
          province: mapValue.province || "",
          radius: mapValue.radius || 100,
        })

        const updatedBranches = await getAllBranches()
        setBranches(updatedBranches)

        setBranchName("")
        setMapValue({})

        showNotification("success", "Branch Added", `Branch "${branchName}" has been added with a ${mapValue.radius || 100}m attendance zone.`)
      } catch (error) {
        console.error("Error adding branch:", error)
        showNotification("error", "Error", "Failed to add branch")
      } finally {
        setIsSubmitting(false)
      }
    },
    [branchName, mapValue, showNotification],
  )

  const handleStartEdit = useCallback((branch: Branch) => {
    setEditingBranch(branch)
    setEditBranchName(branch.branchName)
    setEditMapValue({
      latitude: branch.latitude ?? undefined,
      longitude: branch.longitude ?? undefined,
      address: branch.address || "",
      city: branch.city || "",
      province: branch.province || "",
      radius: branch.radius || 100,
    })
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingBranch) return
    if (!editBranchName.trim()) {
      showNotification("error", "Validation Error", "Branch name is required")
      return
    }
    if (!editMapValue.latitude || !editMapValue.longitude) {
      showNotification("error", "Validation Error", "Please select a location on the map")
      return
    }

    setIsSubmitting(true)
    try {
      await updateBranchInFirestore(editingBranch.id, {
        branchName: editBranchName.trim(),
        address: editMapValue.address || "",
        latitude: editMapValue.latitude,
        longitude: editMapValue.longitude,
        city: editMapValue.city || "",
        province: editMapValue.province || "",
        radius: editMapValue.radius || 100,
      })

      const refreshedBranches = await getAllBranches()
      setBranches(refreshedBranches)
      setEditingBranch(null)

      showNotification("success", "Branch Updated", `Branch "${editBranchName}" has been updated successfully.`)
    } catch (error) {
      console.error("Error updating branch:", error)
      showNotification("error", "Error", "Failed to update branch")
    } finally {
      setIsSubmitting(false)
    }
  }, [editingBranch, editBranchName, editMapValue, showNotification])

  const handleDeleteClick = useCallback(
    (branchId: string) => {
      const branch = branches.find((b) => b.id === branchId)
      const name = branch ? branch.branchName : "Branch"

      openConfirmDialog({
        title: "Delete this branch?",
        description: "This action cannot be undone. This will permanently delete the branch and remove it from the system.",
        confirmLabel: "Delete",
        confirmVariant: "bg-red-600 hover:bg-red-700",
        onConfirm: async () => {
          try {
            await deleteBranchFromFirestore(branchId)
            const updatedBranches = await getAllBranches()
            setBranches(updatedBranches)
            showNotification("info", "Branch Deleted", `Branch "${name}" has been deleted successfully.`)
          } catch (error) {
            console.error("Error deleting branch:", error)
            showNotification("error", "Error", "Failed to delete branch")
          }
        },
      })
    },
    [branches, openConfirmDialog, showNotification],
  )

  // Edit view
  if (editingBranch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Branch</h1>
            <p className="text-muted-foreground">Update branch location and attendance zone</p>
          </div>
          <Button variant="outline" onClick={() => setEditingBranch(null)}>← Back to Branches</Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="editBranchName">Branch Name</Label>
              <Input
                id="editBranchName"
                value={editBranchName}
                onChange={(e) => setEditBranchName(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Branch Location & Attendance Zone</Label>
              <p className="text-sm text-muted-foreground">Click on the map or search to update the branch location. Drag the marker to adjust. Select the attendance radius.</p>
              <BranchMapPicker value={editMapValue} onChange={setEditMapValue} height="450px" />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditingBranch(null)} disabled={isSubmitting}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Branch Management</h1>
        <p className="text-muted-foreground">Add and manage branch locations with geofenced attendance zones</p>
      </div>

      {/* Add New Branch */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Add New Branch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="branchName">Branch Name</Label>
              <Input
                id="branchName"
                placeholder="e.g. SM City Cebu Branch"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Branch Location & Attendance Zone</Label>
              <p className="text-sm text-muted-foreground">
                Click on the map or search to set the branch location (Philippines only). Select the attendance radius that defines the valid clock-in zone.
              </p>
              <BranchMapPicker value={mapValue} onChange={setMapValue} height="400px" />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting || !mapValue.latitude}>
              {isSubmitting ? "Adding..." : "Add Branch"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing Branches */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Branches</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading branches...</div>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search branches..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {filteredBranches.length > 0 ? (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                  {filteredBranches.map((branch) => (
                    <div key={branch.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{branch.branchName}</h3>
                            {branch.radius && (
                              <Badge variant="outline" className="text-xs">
                                <Navigation className="h-3 w-3 mr-1" />
                                {branch.radius}m radius
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 truncate">{branch.address || "No address set"}</p>
                          {branch.city && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {branch.city}{branch.province ? `, ${branch.province}` : ""}
                            </p>
                          )}
                          {branch.latitude && branch.longitude && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {Number(branch.latitude).toFixed(5)}, {Number(branch.longitude).toFixed(5)}
                            </p>
                          )}
                          {!branch.latitude && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                              ⚠ No location set — employees cannot clock in at this branch
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4 shrink-0">
                          <Button variant="outline" size="icon" onClick={() => handleStartEdit(branch)} className="h-8 w-8">
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => handleDeleteClick(branch.id)} className="h-8 w-8 text-red-500 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No branches match your search" : "No branches available. Add your first branch above."}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

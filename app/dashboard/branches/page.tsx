"use client"

import type React from "react"
import { useState, useCallback, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useNotification } from "@/components/notification-provider"
import { useDialog } from "@/components/dialog-provider"
import { Search, Pencil, Trash2 } from "lucide-react"
import EditBranchDialog from "@/components/edit-branch-dialog"
import {
  getAllBranches,
  addBranch as addBranchToFirestore,
  updateBranch as updateBranchInFirestore,
  deleteBranch as deleteBranchFromFirestore,
  type Branch,
} from "@/lib/firestore-branch-service"

export default function BranchesPage() {
  const { showNotification } = useNotification()
  const { openDialog, closeDialog, openConfirmDialog } = useDialog()

  const [formData, setFormData] = useState({
    branchName: "",
    address: "",
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [editingBranch, setEditingBranch] = useState<any>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch branches from Firestore on mount
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setIsLoading(true)
        console.log("Fetching branches from Firestore...")
        const branchesData = await getAllBranches()
        console.log("Branches fetched:", branchesData)
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

  // Filter branches based on search query
  const filteredBranches = branches.filter((branch) => {
    return branch.branchName.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleEditInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setEditingBranch((prev: any) => ({ ...prev, [name]: value }))
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!formData.branchName || !formData.address) {
        showNotification("error", "Validation Error", "Branch name and address are required")
        return
      }

      setIsSubmitting(true)
      try {
        // Add new branch to Firestore
        await addBranchToFirestore({
          branchName: formData.branchName,
          address: formData.address,
        })

        // Refresh branches list
        const updatedBranches = await getAllBranches()
        setBranches(updatedBranches)

        // Reset form
        setFormData({
          branchName: "",
          address: "",
        })

        showNotification("success", "Branch Added", `Branch "${formData.branchName}" has been added successfully.`)
      } catch (error) {
        console.error("Error adding branch:", error)
        showNotification("error", "Error", "Failed to add branch")
      } finally {
        setIsSubmitting(false)
      }
    },
    [formData, showNotification],
  )

  const handleStartEdit = useCallback(
    (branch: Branch) => {
      const branchCopy = { ...branch }

      openDialog(
        <EditBranchDialog
          initialBranch={branchCopy}
          onSave={async (updatedBranch) => {
            try {
              await updateBranchInFirestore(updatedBranch.id, updatedBranch)
              
              // Refresh branches list
              const refreshedBranches = await getAllBranches()
              setBranches(refreshedBranches)
              
              closeDialog()
              showNotification(
                "success",
                "Branch Updated",
                `Branch "${updatedBranch.branchName}" has been updated successfully.`,
              )
            } catch (error) {
              console.error("Error updating branch:", error)
              showNotification("error", "Error", "Failed to update branch")
            }
          }}
          onCancel={closeDialog}
        />,
        "Edit Branch",
      )
    },
    [openDialog, closeDialog, showNotification],
  )

  const handleDeleteClick = useCallback(
    (branchId: string) => {
      // Find branch details for notification
      const branch = branches.find((b) => b.id === branchId)
      const branchName = branch ? branch.branchName : "Branch"

      openConfirmDialog({
        title: "Delete this branch?",
        description:
          "This action cannot be undone. This will permanently delete the branch and remove it from the system.",
        confirmLabel: "Delete",
        confirmVariant: "bg-red-600 hover:bg-red-700",
        onConfirm: async () => {
          try {
            await deleteBranchFromFirestore(branchId)
            
            // Refresh branches list
            const updatedBranches = await getAllBranches()
            setBranches(updatedBranches)
            
            showNotification("info", "Branch Deleted", `Branch "${branchName}" has been deleted successfully.`)
          } catch (error) {
            console.error("Error deleting branch:", error)
            showNotification("error", "Error", "Failed to delete branch")
          }
        },
      })
    },
    [branches, openConfirmDialog, showNotification],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Branch Management</h1>
        <p className="text-muted-foreground">Add and manage branch locations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Add New Branch</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="branchName">Branch Name</Label>
                <Input
                  id="branchName"
                  name="branchName"
                  placeholder="Enter branch name"
                  value={formData.branchName}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  name="address"
                  placeholder="Enter branch address"
                  rows={4}
                  value={formData.address}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Branch"}
              </Button>
            </form>
          </CardContent>
        </Card>

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
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                    {filteredBranches.map((branch) => (
                      <div key={branch.id} className="p-4 rounded-lg border bg-card">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">{branch.branchName}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{branch.address}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleStartEdit(branch)}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteClick(branch.id)}
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                            >
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
                    {searchQuery ? "No branches match your search" : "No branches available"}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

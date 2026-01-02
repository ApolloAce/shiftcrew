"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface EditBranchDialogProps {
  initialBranch: {
    id: number
    branchName: string
    address: string
  }
  onSave: (branch: any) => void
  onCancel: () => void
}

export default function EditBranchDialog({ initialBranch, onSave, onCancel }: EditBranchDialogProps) {
  const [editData, setEditData] = useState({
    ...initialBranch,
  })

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setEditData((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleSave = useCallback(() => {
    if (!editData.branchName || !editData.address) {
      return
    }
    onSave(editData)
  }, [editData, onSave])

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="editBranchName">Branch Name</Label>
          <Input id="editBranchName" name="branchName" value={editData.branchName} onChange={handleInputChange} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="editAddress">Address</Label>
          <Textarea id="editAddress" name="address" rows={4} value={editData.address} onChange={handleInputChange} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  )
}

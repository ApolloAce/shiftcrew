"use client"

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Dialog context type
type DialogContextType = {
  openDialog: (content: ReactNode, title?: string) => void
  closeDialog: () => void
  openConfirmDialog: (options: {
    title: string
    description: ReactNode
    confirmLabel?: string
    cancelLabel?: string
    confirmVariant?: string
    onConfirm: () => void
    onCancel?: () => void
  }) => void
  closeConfirmDialog: () => void
}

// Create context
const DialogContext = createContext<DialogContextType | undefined>(undefined)

// Dialog provider component
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogContent, setDialogContent] = useState<ReactNode | null>(null)
  const [dialogTitle, setDialogTitle] = useState<string | undefined>(undefined)

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirmOptions, setConfirmOptions] = useState<{
    title: string
    description: ReactNode
    confirmLabel?: string
    cancelLabel?: string
    confirmVariant?: string
    onConfirm: () => void
    onCancel?: () => void
  } | null>(null)

  // Use refs to track if component is mounted
  const isMounted = useRef(true)

  // Set isMounted to false when component unmounts
  useCallback(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const openDialog = useCallback((content: ReactNode, title?: string) => {
    if (!isMounted.current) return
    setDialogContent(content)
    setDialogTitle(title)
    setDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    if (!isMounted.current) return
    setDialogOpen(false)
    // Clear content after animation completes
    setTimeout(() => {
      if (isMounted.current) {
        setDialogContent(null)
        setDialogTitle(undefined)
      }
    }, 300)
  }, [])

  const openConfirmDialog = useCallback(
    (options: {
      title: string
      description: ReactNode
      confirmLabel?: string
      cancelLabel?: string
      confirmVariant?: string
      onConfirm: () => void
      onCancel?: () => void
    }) => {
      if (!isMounted.current) return
      setConfirmOptions(options)
      setConfirmDialogOpen(true)
    },
    [],
  )

  const closeConfirmDialog = useCallback(() => {
    if (!isMounted.current) return
    setConfirmDialogOpen(false)
    // Clear options after animation completes
    setTimeout(() => {
      if (isMounted.current) {
        setConfirmOptions(null)
      }
    }, 300)
  }, [])

  const handleConfirm = useCallback(() => {
    if (!isMounted.current) return
    if (confirmOptions?.onConfirm) {
      try {
        confirmOptions.onConfirm()
      } catch (error) {
        console.error("Error in confirm handler:", error)
      }
    }
    closeConfirmDialog()
  }, [confirmOptions, closeConfirmDialog])

  const handleCancel = useCallback(() => {
    if (!isMounted.current) return
    if (confirmOptions?.onCancel) {
      try {
        confirmOptions.onCancel()
      } catch (error) {
        console.error("Error in cancel handler:", error)
      }
    }
    closeConfirmDialog()
  }, [confirmOptions, closeConfirmDialog])

  return (
    <DialogContext.Provider
      value={{
        openDialog,
        closeDialog,
        openConfirmDialog,
        closeConfirmDialog,
      }}
    >
      {children}

      {/* Regular Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && isMounted.current) closeDialog()
        }}
      >
        {dialogContent && (
          <DialogContent>
            {dialogTitle && (
              <DialogHeader>
                <DialogTitle>{dialogTitle}</DialogTitle>
              </DialogHeader>
            )}
            {dialogContent}
          </DialogContent>
        )}
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          if (!open && isMounted.current) closeConfirmDialog()
        }}
      >
        {confirmOptions && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmOptions.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmOptions.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={handleCancel}>{confirmOptions.cancelLabel || "Cancel"}</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm} className={confirmOptions.confirmVariant || ""}>
                {confirmOptions.confirmLabel || "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </DialogContext.Provider>
  )
}

// Custom hook to use the dialog context
export function useDialog() {
  const context = useContext(DialogContext)
  if (context === undefined) {
    console.error("useDialog must be used within a DialogProvider")
    // Return a dummy implementation to prevent crashes
    return {
      openDialog: () => console.warn("Dialog attempted outside provider"),
      closeDialog: () => {},
      openConfirmDialog: () => console.warn("Confirm dialog attempted outside provider"),
      closeConfirmDialog: () => {},
    }
  }
  return context
}

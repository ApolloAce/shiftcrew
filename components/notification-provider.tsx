"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useToast } from "@/hooks/use-toast"

// Define the context type
type NotificationContextType = {
  showNotification: (type: "success" | "error" | "info", title: string, description?: string) => void
}

// Create the context
const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

// Provider component
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()

  const showNotification = (type: "success" | "error" | "info", title: string, description?: string) => {
    toast({
      title,
      description,
      variant: type === "error" ? "destructive" : "default",
      duration: 3000,
    })
  }

  return <NotificationContext.Provider value={{ showNotification }}>{children}</NotificationContext.Provider>
}

// Custom hook to use the notification context
export function useNotification() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    console.error("useNotification must be used within a NotificationProvider")
    // Return a dummy implementation to prevent crashes
    return {
      showNotification: (type: "success" | "error" | "info", title: string, description?: string) => {
        console.warn("Notification attempted outside provider:", { type, title, description })
      },
    }
  }
  return context
}

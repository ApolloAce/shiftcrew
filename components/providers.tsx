"use client"

import { type ReactNode, useEffect } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { NotificationProvider } from "@/components/notification-provider"
import { DialogProvider } from "@/components/dialog-provider"
import { Toaster } from "@/components/ui/toaster"
import { ErrorBoundary } from "@/components/error-boundary"

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    const reloadKey = "chunk-reload-attempted"

    const shouldReloadForChunkError = (msg: string) => {
      const text = msg.toLowerCase()
      return text.includes("chunkloaderror") || (text.includes("failed to load chunk") && text.includes("/_next/static/chunks"))
    }

    const reloadOnce = () => {
      if (sessionStorage.getItem(reloadKey) === "1") return
      sessionStorage.setItem(reloadKey, "1")
      window.location.reload()
    }

    const onWindowError = (event: ErrorEvent) => {
      const msg = event.message || event.error?.message || ""
      if (shouldReloadForChunkError(msg)) {
        reloadOnce()
      }
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const msg =
        (typeof reason === "string" ? reason : "") ||
        reason?.message ||
        reason?.toString?.() ||
        ""
      if (shouldReloadForChunkError(msg)) {
        reloadOnce()
      }
    }

    window.addEventListener("error", onWindowError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    return () => {
      window.removeEventListener("error", onWindowError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <NotificationProvider>
          <DialogProvider>
            {children}
            <Toaster />
          </DialogProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

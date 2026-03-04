import type React from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { useCrewStore } from "@/lib/cleanStore"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "ShiftCrew - Crew Management System",
  description: "Manage your crew members efficiently",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // No automatic sample data initialization. Store starts empty by default.

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface FirestoreTestResult {
  success: boolean
  error?: string
  totalUsers?: number
  employees?: number
  allUsersData?: any[]
  employeesData?: any[]
  message?: string
}

export default function FirestoreDebugPage() {
  const [result, setResult] = useState<FirestoreTestResult | null>(null)
  const [loading, setLoading] = useState(false)

  const testConnection = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/test/firestore")
      const data = await res.json()
      setResult(data)
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    testConnection()
  }, [])

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Firestore Debug Test</h1>

      <Button onClick={testConnection} disabled={loading}>
        {loading ? "Testing..." : "Test Firestore Connection"}
      </Button>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className={result.success ? "text-green-600" : "text-red-600"}>
              {result.success ? "✓ Success" : "✗ Error"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.message && <p className="text-sm">{result.message}</p>}
            {result.error && <p className="text-sm text-red-600">Error: {result.error}</p>}
            {result.totalUsers !== undefined && (
              <div className="space-y-2">
                <p className="font-semibold">Firestore Query Results:</p>
                <p className="text-sm">• Total users in collection: {result.totalUsers}</p>
                <p className="text-sm">• Users with role='employee': {result.employees}</p>
              </div>
            )}

            {result.allUsersData && result.allUsersData.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">All Users:</p>
                <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(result.allUsersData, null, 2)}
                </pre>
              </div>
            )}

            {result.employeesData && result.employeesData.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Employees (role='employee'):</p>
                <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(result.employeesData, null, 2)}
                </pre>
              </div>
            )}

            {result.employeesData && result.employeesData.length === 0 && (
              <p className="text-sm text-yellow-600">
                No employees found with role='employee'. Check your Firestore data.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

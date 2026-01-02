"use client"

import type React from "react"

import { useRef, useEffect } from "react"
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  Title,
  PieController,
  DoughnutController,
  type ChartData,
  type ChartOptions,
} from "chart.js"
import { cn } from "@/lib/utils"

// Register ALL the required Chart.js components including BarController and BarElement
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  Title,
  PieController,
  DoughnutController,
)

interface ChartProps extends React.HTMLAttributes<HTMLCanvasElement> {
  type: "pie" | "doughnut"
  data: ChartData
  options?: ChartOptions
  width?: number
  height?: number
}

export function Chart({ type, data, options, width, height, className, ...props }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartJS | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Destroy previous chart instance if it exists
    if (chartRef.current) {
      chartRef.current.destroy()
    }

    // Create new chart
    const ctx = canvasRef.current.getContext("2d")
    if (ctx) {
      chartRef.current = new ChartJS(ctx, {
        type,
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...options,
        },
      })
    }

    // Cleanup on unmount
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
      }
    }
  }, [type, data, options])

  return <canvas ref={canvasRef} width={width} height={height} className={cn("", className)} {...props} />
}

// Export other components that might be needed
export const ChartContainer = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={cn("relative h-full w-full", className)} {...props}>
      {children}
    </div>
  )
}

export const ChartTooltip = () => null
export const ChartTooltipContent = () => null
export const ChartLegend = () => null
export const ChartLegendContent = () => null
export const ChartStyle = () => null

"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DayPicker } from "react-day-picker"
import "react-day-picker/dist/style.css"

interface BasicDatePickerProps {
  date: Date
  setDate: (date: Date) => void
  className?: string
}

export function BasicDatePicker({ date, setDate, className }: BasicDatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const handleDayClick = (day: Date) => {
    setDate(day)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        className={`w-full justify-start text-left font-normal ${className}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <CalendarIcon className="mr-2 h-5 w-5" />
        {format(date, "MMMM d, yyyy")}
      </Button>

      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700">
          <DayPicker mode="single" selected={date} onDayClick={handleDayClick} defaultMonth={date} className="p-3" />
        </div>
      )}
    </div>
  )
}

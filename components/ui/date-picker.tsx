"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DatePickerProps {
  date: Date | undefined
  setDate: (date: Date | undefined) => void
  disableFutureDates?: boolean
  className?: string
}

export function DatePicker({ date, setDate, disableFutureDates = false, className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Function to disable future dates if needed
  const disableDate = (date: Date) => {
    if (disableFutureDates) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return date > today
    }
    return false
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal border-primary-200",
            !date && "text-muted-foreground",
            className,
          )}
          onClick={() => setOpen(true)}
        >
          <CalendarIcon className="mr-2 h-5 w-5" />
          {date ? format(date, "MMMM d, yyyy") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800 shadow-lg z-50" align="start" sideOffset={5}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            setDate(newDate)
            setOpen(false)
          }}
          disabled={disableFutureDates ? disableDate : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

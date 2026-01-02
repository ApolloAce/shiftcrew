"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DayPicker } from "react-day-picker"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import "react-day-picker/dist/style.css"

interface SimpleDatePickerProps {
  date: Date
  setDate: (date: Date) => void
  className?: string
}

export function SimpleDatePicker({ date, setDate, className }: SimpleDatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Date>(date)

  // When the external date changes, update our internal state
  React.useEffect(() => {
    setSelected(date)
  }, [date])

  const handleSelect = (day: Date | undefined) => {
    if (day) {
      setSelected(day)
      setDate(day)
      setIsOpen(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={`w-full justify-start text-left font-normal ${className}`}>
          <CalendarIcon className="mr-2 h-5 w-5" />
          {format(date, "MMMM d, yyyy")}
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 max-w-fit">
        <div className="p-3 bg-white dark:bg-gray-800">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected}
            className="border-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

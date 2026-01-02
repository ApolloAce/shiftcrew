export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary-50 to-secondary-200">
      <div className="text-center">
        <div className="text-lg font-medium">Loading...</div>
        <div className="text-sm text-muted-foreground mt-2">Please wait</div>
      </div>
    </div>
  )
}

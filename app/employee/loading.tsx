export default function Loading() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <div className="text-lg font-medium">Loading...</div>
        <div className="text-sm text-muted-foreground mt-2">Please wait while we fetch your data</div>
      </div>
    </div>
  )
}

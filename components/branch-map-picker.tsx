"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { PH_CENTER, PH_BOUNDS, RADIUS_OPTIONS } from "@/lib/geo-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MapPin, Search, Loader2 } from "lucide-react"

// Leaflet CSS must be loaded globally — we inject it once
let leafletCssInjected = false
function injectLeafletCss() {
  if (leafletCssInjected || typeof document === "undefined") return
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
  link.crossOrigin = ""
  document.head.appendChild(link)
  leafletCssInjected = true
}

export interface MapPickerValue {
  latitude: number
  longitude: number
  address: string
  city: string
  province: string
  radius: number
}

interface BranchMapPickerProps {
  value?: Partial<MapPickerValue>
  onChange: (value: MapPickerValue) => void
  height?: string
}

export default function BranchMapPicker({ value, onChange, height = "400px" }: BranchMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const handleMapClickRef = useRef<(lat: number, lng: number) => void>(() => {})
  const onChangeRef = useRef(onChange)
  const [L, setL] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [isReversing, setIsReversing] = useState(false)

  const currentLat = value?.latitude ?? PH_CENTER.lat
  const currentLng = value?.longitude ?? PH_CENTER.lng
  const currentRadius = value?.radius ?? 100

  // Load Leaflet dynamically (client-side only)
  useEffect(() => {
    injectLeafletCss()
    import("leaflet").then((leaflet) => {
      setL(leaflet.default || leaflet)
    })
  }, [])

  // Initialize map
  useEffect(() => {
    if (!L || !mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [currentLat, currentLng],
      zoom: value?.latitude ? 16 : 6,
      maxBounds: L.latLngBounds(
        L.latLng(PH_BOUNDS.south, PH_BOUNDS.west),
        L.latLng(PH_BOUNDS.north, PH_BOUNDS.east)
      ),
      minZoom: 5,
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    // Custom marker icon
    const icon = L.icon({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    })

    if (value?.latitude && value?.longitude) {
      const marker = L.marker([value.latitude, value.longitude], { icon, draggable: true }).addTo(map)
      markerRef.current = marker

      const circle = L.circle([value.latitude, value.longitude], {
        radius: currentRadius,
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map)
      circleRef.current = circle

      marker.on("dragend", () => {
        const pos = marker.getLatLng()
        handleMapClickRef.current(pos.lat, pos.lng)
      })
    }

    map.on("click", (e: any) => {
      handleMapClickRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L])

  // Update circle radius when it changes
  useEffect(() => {
    if (!circleRef.current || !L) return
    circleRef.current.setRadius(currentRadius)
  }, [currentRadius, L])

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // This function is also accessed via handleMapClickRef for stable event handlers
    if (!L || !mapRef.current) return

    // Clamp to Philippines bounds
    if (lat < PH_BOUNDS.south || lat > PH_BOUNDS.north || lng < PH_BOUNDS.west || lng > PH_BOUNDS.east) {
      return
    }

    const icon = L.icon({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    })

    // Update or create marker
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(mapRef.current)
      marker.on("dragend", () => {
        const pos = marker.getLatLng()
        handleMapClickRef.current(pos.lat, pos.lng)
      })
      markerRef.current = marker
    }

    // Update or create circle
    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng])
    } else {
      const circle = L.circle([lat, lng], {
        radius: currentRadius,
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(mapRef.current)
      circleRef.current = circle
    }

    // Reverse geocode using Nominatim (free, no API key)
    setIsReversing(true)
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`)
      if (!res.ok) throw new Error(`Geocode API error ${res.status}`)
      const data = await res.json()
      const addr = data.address || {}
      const displayName = data.display_name || ""
      const city = addr.city || addr.town || addr.municipality || addr.village || ""
      const province = addr.state || addr.province || addr.region || ""

      const result = {
        latitude: lat,
        longitude: lng,
        address: displayName,
        city,
        province,
        radius: currentRadius,
      }
      console.log("[MapPicker] Reverse geocode result:", result)
      onChangeRef.current(result)
    } catch (err) {
      console.error("[MapPicker] Reverse geocode error:", err)
      const fallback = {
        latitude: lat,
        longitude: lng,
        address: value?.address || "",
        city: value?.city || "",
        province: value?.province || "",
        radius: currentRadius,
      }
      console.log("[MapPicker] Using fallback:", fallback)
      onChangeRef.current(fallback)
    } finally {
      setIsReversing(false)
    }
  }, [L, currentRadius, value?.address, value?.city, value?.province])

  // Keep refs always pointing to the latest callbacks
  useEffect(() => {
    handleMapClickRef.current = handleMapClick
  }, [handleMapClick])
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Search location by name (Nominatim)
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapRef.current) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery + ", Philippines")}`)
      if (!res.ok) throw new Error(`Geocode API error ${res.status}`)
      const results = await res.json()
      if (results.length > 0) {
        const r = results[0]
        const lat = parseFloat(r.lat)
        const lng = parseFloat(r.lon)
        mapRef.current.setView([lat, lng], 16)
        handleMapClick(lat, lng)
      }
    } catch (err) {
      console.error("Search error:", err)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, handleMapClick])

  const handleRadiusChange = useCallback((radiusStr: string) => {
    const newRadius = parseInt(radiusStr, 10)
    onChangeRef.current({
      latitude: value?.latitude ?? PH_CENTER.lat,
      longitude: value?.longitude ?? PH_CENTER.lng,
      address: value?.address || "",
      city: value?.city || "",
      province: value?.province || "",
      radius: newRadius,
    })
  }, [value])

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search location in the Philippines..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button type="button" variant="outline" onClick={handleSearch} disabled={isSearching}>
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </div>

      {/* Map container */}
      <div
        ref={mapContainerRef}
        style={{ height, width: "100%" }}
        className="rounded-lg border overflow-hidden"
      />

      {/* Radius selector */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Attendance Radius</Label>
          <Select value={String(currentRadius)} onValueChange={handleRadiusChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Coordinates</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground h-10 px-3 border rounded-md bg-muted/30">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {value?.latitude && typeof value.latitude === "number"
              ? `${value.latitude.toFixed(5)}, ${(Number(value.longitude) || 0).toFixed(5)}`
              : "Click on the map to set location"}
          </div>
        </div>
      </div>

      {/* Resolved address display */}
      {isReversing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving address...
        </div>
      )}
      {value?.address && !isReversing && (
        <div className="text-sm space-y-1">
          <div><span className="font-medium">Address:</span> {value.address}</div>
          {value.city && <div><span className="font-medium">City:</span> {value.city}</div>}
          {value.province && <div><span className="font-medium">Province:</span> {value.province}</div>}
        </div>
      )}
    </div>
  )
}

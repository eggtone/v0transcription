"use client"

import React, { useState, useEffect, useRef } from "react"
import { Pin, PinOff } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { AudioPlayer } from "./audio-player"
import { cn } from "@/utils"

interface FloatingPlayerProps {
  audioUrl: string
  audioFileName: string
}

export function FloatingPlayer({ audioUrl, audioFileName }: FloatingPlayerProps) {
  const [isFloatingEnabled, setIsFloatingEnabled] = useState(true)
  const [isOutOfView, setIsOutOfView] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Use scroll event instead of Intersection Observer for better cross-browser compatibility
  useEffect(() => {
    // Function to check if element is in viewport
    const isInViewport = () => {
      if (!containerRef.current) return true
      
      const rect = containerRef.current.getBoundingClientRect()
      // Consider element out of view when it's above the viewport
      return rect.top >= 0
    }
    
    // Check on scroll
    const handleScroll = () => {
      setIsOutOfView(!isInViewport())
    }
    
    // Initial check
    handleScroll()
    
    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Determine if the player should be floating
  const shouldFloat = isFloatingEnabled && isOutOfView

  return (
    <div ref={containerRef} className="w-full max-w-3xl mx-auto mb-4">
      {/* Original player container */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Audio Player</h3>
            <div className="flex items-center space-x-2">
              <Switch
                id="float-player"
                checked={isFloatingEnabled}
                onCheckedChange={setIsFloatingEnabled}
                aria-label="Toggle floating player"
              />
              <Label htmlFor="float-player" className="flex items-center cursor-pointer">
                {isFloatingEnabled ? (
                  <>
                    <Pin className="h-4 w-4 mr-1" />
                    <span className="text-sm">Floating</span>
                  </>
                ) : (
                  <>
                    <PinOff className="h-4 w-4 mr-1" />
                    <span className="text-sm">Not Floating</span>
                  </>
                )}
              </Label>
            </div>
          </div>
          
          <AudioPlayer audioUrl={audioUrl} audioFileName={audioFileName} />
        </div>
      </div>

      {/* Floating player - only shown when scrolled out of view and floating is enabled */}
      {shouldFloat && (
        <div 
          className="fixed top-2 left-1/2 transform -translate-x-1/2 z-50 rounded-lg border bg-card shadow-lg transition-all duration-300"
          style={{
            width: '90%',
            maxWidth: '500px'
          }}
        >
          <div className="p-2">
            <AudioPlayer audioUrl={audioUrl} audioFileName={audioFileName} />
          </div>
        </div>
      )}
    </div>
  )
} 
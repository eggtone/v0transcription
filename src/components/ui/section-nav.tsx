"use client"

import React, { useEffect, useState } from "react"
import { Upload, Play, FileText, ScrollText } from "lucide-react"
import { Button } from "./button"
import { cn } from "@/utils"

interface Section {
  id: string
  icon: React.ReactNode
  label: string
}

interface SectionNavProps {
  sections: Section[]
}

export function SectionNav({ sections }: SectionNavProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null)

  useEffect(() => {
    // Function to determine which section is currently in view
    const handleScroll = () => {
      const sectionElements = sections.map(section => 
        document.getElementById(section.id)
      ).filter(Boolean) as HTMLElement[]
      
      // Find the section that's most visible in the viewport
      for (const el of sectionElements) {
        const rect = el.getBoundingClientRect()
        // If the section is in view (with some buffer for better UX)
        if (rect.top <= 100 && rect.bottom >= 0) {
          setActiveSection(el.id)
          break
        }
      }
    }

    // Initial check and scroll event listener
    handleScroll()
    window.addEventListener("scroll", handleScroll)
    
    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [sections])

  const scrollToSection = (id: string) => {
    const section = document.getElementById(id)
    if (section) {
      // Scroll to section with a small offset from the top
      window.scrollTo({
        top: section.offsetTop - 80,
        behavior: "smooth"
      })
    }
  }

  return (
    <div className="fixed right-6 top-1/2 transform -translate-y-1/2 z-50 flex flex-col gap-2 rounded-full bg-background border shadow-md p-2">
      {sections.map((section) => (
        <Button
          key={section.id}
          variant="ghost"
          size="icon"
          onClick={() => scrollToSection(section.id)}
          className={cn(
            "rounded-full",
            activeSection === section.id && "bg-primary/10 text-primary"
          )}
          title={section.label}
        >
          {section.icon}
        </Button>
      ))}
    </div>
  )
} 
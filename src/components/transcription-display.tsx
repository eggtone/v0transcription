import React, { useState } from "react"
import { Check, Copy, Download, Edit, Layout, List, Save, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DetailedTranscription, DisplayMode } from "@/types"
import { formatTimestamp } from "@/utils"

interface TranscriptionDisplayProps {
  transcriptionData: DetailedTranscription
  onTextUpdate?: (text: string) => void
  audioFileName?: string
}

export function TranscriptionDisplay({ 
  transcriptionData, 
  onTextUpdate,
  audioFileName
}: TranscriptionDisplayProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("segments")
  const [editedContent, setEditedContent] = useState<string>("")
  const [copied, setCopied] = useState<boolean>(false)
  const [isSaved, setIsSaved] = useState<boolean>(false)
  const [hasInitializedEdit, setHasInitializedEdit] = useState<boolean>(false)

  // Reset state when transcription data changes
  React.useEffect(() => {
    if (transcriptionData) {
      // Reset edit related state
      setEditedContent("")
      setHasInitializedEdit(false)
    }
  }, [transcriptionData])

  // Format transcription based on the display mode
  const formatTranscription = (): string => {
    if (!transcriptionData) return ""

    if (displayMode === "edit" && editedContent) {
      return editedContent
    }

    // For other display modes, format accordingly
    if (displayMode === "compact") {
      return transcriptionData.text || ""
    } else if (displayMode === "segments") {
      return (transcriptionData.segments || [])
        .map((segment) => segment.text)
        .join("\n")
    } else if (displayMode === "segments-with-time") {
      return (transcriptionData.segments || [])
        .map((segment) => `${formatTimestamp(segment.start)} ${segment.text}`)
        .join("\n")
    }

    return transcriptionData.text || ""
  }

  // Notify parent component when formatted text changes
  React.useEffect(() => {
    const formattedText = formatTranscription()
    if (onTextUpdate) {
      onTextUpdate(formattedText)
    }
  }, [displayMode, editedContent, transcriptionData])

  const handleCopyToClipboard = () => {
    const textToCopy = displayMode === "edit" ? editedContent : formatTranscription()
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const textToDownload = displayMode === "edit" ? editedContent : formatTranscription()
    const element = document.createElement("a")
    const file = new Blob([textToDownload], { type: "text/plain" })
    element.href = URL.createObjectURL(file)
    
    // Use the audio file name if provided, otherwise use a default name
    if (audioFileName) {
      // Remove file extension and add "_transcription.txt"
      const baseName = audioFileName.replace(/\.[^/.]+$/, "")
      element.download = `${baseName}_transcription.txt`
    } else {
      element.download = "transcription.txt"
    }
    
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const handleDisplayModeChange = (value: string) => {
    if (!value) return

    const newMode = value as DisplayMode

    // If switching to edit mode for the first time, initialize with current formatted content
    if (newMode === "edit" && !hasInitializedEdit) {
      const currentText = formatTranscription()
      setEditedContent(currentText)
      setHasInitializedEdit(true)
    } else if (displayMode === "edit" && newMode !== "edit") {
      // Leaving edit mode, save the content
      handleSaveEdit()
    }

    setDisplayMode(newMode)
  }

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value)
    setIsSaved(false)
  }

  const handleSaveEdit = () => {
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">Display Mode</div>
        <ToggleGroup 
          type="single" 
          value={displayMode} 
          onValueChange={handleDisplayModeChange} 
          className="ml-auto"
        >
          <ToggleGroupItem value="compact" aria-label="Compact view" title="Compact view" className="px-3">
            <Layout className="h-4 w-4 mr-1" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:ml-1">Compact</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="segments" aria-label="Segments view" title="Segments view" className="px-3">
            <List className="h-4 w-4 mr-1" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:ml-1">Segments</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="segments-with-time" aria-label="Segments with time" title="Segments with time" className="px-3">
            <Timer className="h-4 w-4 mr-1" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:ml-1">With Time</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="edit" aria-label="Edit mode" title="Edit transcription" className="px-3">
            <Edit className="h-4 w-4 mr-1" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:ml-1">Edit</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      
      <div className="w-full" style={{ height: "350px" }}>
        <Textarea
          id="transcription"
          value={displayMode === "edit" ? editedContent : formatTranscription()}
          readOnly={displayMode !== "edit"}
          onChange={handleEditChange}
          className="w-full h-full resize-none overflow-auto"
          style={{ 
            display: "block", 
            boxSizing: "border-box",
            minHeight: "100%"
          }}
        />
      </div>
      
      <div className="flex justify-end gap-2 mt-4">
        {displayMode === "edit" && (
          <Button variant="outline" onClick={handleSaveEdit} className="flex items-center gap-2">
            {isSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {isSaved ? "Saved" : "Save edits"}
          </Button>
        )}
        <Button variant="outline" onClick={handleCopyToClipboard} className="flex items-center gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy to clipboard"}
        </Button>
        <Button variant="default" onClick={handleDownload} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  )
} 
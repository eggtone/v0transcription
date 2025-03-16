"use client"

import React, { useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Copy, Download, Check, Edit, Save, Sparkles } from "lucide-react"
import { Textarea } from "./ui/textarea"
import { Label } from "./ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { SummarizationStyle, getPromptByStyle } from "@/services/prompts"
import { Pin, PinOff } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { AudioPlayer } from "./audio-player"
import { cn } from "@/utils"

interface TranscriptionSummarizationProps {
  transcriptionText: string
  isLoading: boolean
}

type OpenAIModel = "gpt-4o-mini" | "gpt-4o"
type SummaryDisplayMode = "original" | "edit"

export function TranscriptionSummarization({
  transcriptionText,
  isLoading,
}: TranscriptionSummarizationProps) {
  // State for user selections
  const [model, setModel] = useState<OpenAIModel>("gpt-4o-mini")
  const [summarizationStyle, setSummarizationStyle] = useState<SummarizationStyle>("conversation")
  const [customPrompt, setCustomPrompt] = useState<string>("")
  
  // State for the summary
  const [summary, setSummary] = useState<string>("")
  const [editedSummary, setEditedSummary] = useState<string>("")
  const [displayMode, setDisplayMode] = useState<SummaryDisplayMode>("original")
  
  // UI state
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [isCopied, setIsCopied] = useState<boolean>(false)
  const [isSaved, setIsSaved] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Reset summary state when transcription text changes
  React.useEffect(() => {
    // If transcription text is empty or changes, reset the summary
    setSummary("")
    setEditedSummary("")
    setError(null)
    // We don't reset model or summarization style preferences
  }, [transcriptionText])

  const generateSummary = async () => {
    if (!transcriptionText || transcriptionText.trim() === "") {
      setError("No transcription text to summarize.")
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      // Get the appropriate prompt based on the selected style
      const promptTemplate = getPromptByStyle(summarizationStyle, customPrompt)

      // Call the OpenAI API
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: transcriptionText,
          model,
          prompt: promptTemplate,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate summary")
      }

      const data = await response.json()
      setSummary(data.summary)
      setEditedSummary(data.summary) // Initialize edited summary with the original
      setDisplayMode("original") // Reset to original view
    } catch (err) {
      console.error("Summarization error:", err)
      setError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDisplayModeChange = (value: string) => {
    if (!value) return
    setDisplayMode(value as SummaryDisplayMode)
  }

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedSummary(e.target.value)
    setIsSaved(false)
  }

  const handleSaveEdit = () => {
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleCopyToClipboard = async () => {
    const textToCopy = displayMode === "edit" ? editedSummary : summary
    
    try {
      await navigator.clipboard.writeText(textToCopy)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  }

  const handleDownload = () => {
    const textToDownload = displayMode === "edit" ? editedSummary : summary
    const element = document.createElement("a")
    const file = new Blob([textToDownload], { type: "text/plain" })
    element.href = URL.createObjectURL(file)
    element.download = "transcription-summary.txt"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="model">AI Model</Label>
          <Select value={model} onValueChange={(value) => setModel(value as OpenAIModel)}>
            <SelectTrigger id="model">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster)</SelectItem>
              <SelectItem value="gpt-4o">GPT-4o (Higher quality)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="style">Summarization Style</Label>
          <Select 
            value={summarizationStyle} 
            onValueChange={(value) => setSummarizationStyle(value as SummarizationStyle)}
          >
            <SelectTrigger id="style">
              <SelectValue placeholder="Select a style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conversation">Conversation/Interview (2 people)</SelectItem>
              <SelectItem value="lecture">Lecture/Presentation (1 speaker)</SelectItem>
              <SelectItem value="discussion">Discussion/Panel (3+ people)</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {summarizationStyle === "custom" && (
        <div className="space-y-2">
          <Label htmlFor="customPrompt">Custom Instructions</Label>
          <Textarea
            id="customPrompt"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Enter custom instructions for the AI (e.g., 'Summarize this in bullet points focusing on action items')"
            className="min-h-[100px]"
          />
        </div>
      )}

      <Button 
        onClick={generateSummary} 
        disabled={isGenerating || isLoading || !transcriptionText}
        className="w-full"
      >
        {isGenerating ? "Generating Summary..." : "Generate Summary"}
        <Sparkles className="ml-2 h-4 w-4" />
      </Button>

      {error && (
        <div className="text-red-500 text-sm p-2 bg-red-50 rounded border border-red-200">
          {error}
        </div>
      )}

      {summary && (
        <div className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="font-medium text-sm">Summary Display</div>
            <ToggleGroup type="single" value={displayMode} onValueChange={handleDisplayModeChange}>
              <ToggleGroupItem value="original" aria-label="Original summary">
                Original
              </ToggleGroupItem>
              <ToggleGroupItem value="edit" aria-label="Edit summary">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex space-x-2">
              {displayMode === "edit" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveEdit}
                  className="h-8"
                >
                  {isSaved ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {isSaved ? "Saved" : "Save edits"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyToClipboard}
                className="h-8 px-2 lg:px-3"
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only md:not-sr-only md:ml-2">
                  {isCopied ? "Copied" : "Copy"}
                </span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="h-8 px-2 lg:px-3"
              >
                <Download className="h-4 w-4" />
                <span className="sr-only md:not-sr-only md:ml-2">Download</span>
              </Button>
            </div>
          </div>

          <Textarea
            value={displayMode === "edit" ? editedSummary : summary}
            onChange={handleEditChange}
            readOnly={displayMode !== "edit"}
            className="min-h-[200px] font-mono text-sm"
          />
        </div>
      )}
    </div>
  )
}

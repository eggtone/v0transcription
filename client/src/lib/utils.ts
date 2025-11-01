import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { TranscriptionSegment, DetailedTranscription } from "@shared/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format time in seconds to MM:SS display format
 */
export function formatTime(seconds: number): string {
  // Handle invalid inputs
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format timestamp for transcription segments with brackets [MM:SS]
 */
export function formatTimestamp(seconds: number): string {
  return `[${formatTime(seconds)}]`
}

/**
 * Create segments from plain text using various parsing strategies
 */
export function createSegmentsFromText(text: string): DetailedTranscription {
  console.log('Creating segments from text:', text.substring(0, 100) + '...')
  
  // First try splitting by lines
  const lineSegments = text.split(/\n+/).filter(p => p.trim().length > 0)
  
  if (lineSegments.length > 1) {
    console.log(`Split text into ${lineSegments.length} line segments`)
    return {
      text,
      language: 'en',
      segments: lineSegments.map((segment, idx) => createSegment(segment, idx))
    }
  }
  
  // Try to split by sentences if lines didn't work
  const sentenceRegex = /([.!?。？！]+)\s+/g
  const parts = text.trim().split(sentenceRegex)
  
  if (parts.length > 1) {
    // Reassemble sentences with their punctuation
    const sentences = []
    for (let i = 0; i < parts.length - 1; i += 2) {
      if (parts[i]) {
        sentences.push((parts[i] + (parts[i+1] || '')).trim())
      }
    }
    // Add the last part if it exists and isn't punctuation
    if (parts.length % 2 === 1 && parts[parts.length - 1].trim()) {
      sentences.push(parts[parts.length - 1].trim())
    }
    
    if (sentences.length > 0) {
      console.log(`Split text into ${sentences.length} sentences`)
      return {
        text,
        language: 'en',
        segments: sentences.map((sentence, idx) => createSegment(sentence, idx))
      }
    }
  }
  
  // If no sentence splitting worked, try to split by punctuation with context
  const segments = text.split(/(?<=[.!?])\s+/)
  
  if (segments.length > 1) {
    console.log(`Split text into ${segments.length} segments by punctuation`)
    return {
      text,
      language: 'en',
      segments: segments.map((segment, idx) => createSegment(segment, idx))
    }
  }
  
  // Last resort: just use the whole text as one segment
  return {
    text,
    language: 'en',
    segments: [createSegment(text, 0)]
  }
}

/**
 * Extract timestamp from text if present, otherwise return null
 */
export function extractTimestamp(text: string): { timestamp: number | null, cleanText: string } {
  const timestampRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/
  const match = text.match(timestampRegex)
  
  if (match) {
    const minutes = parseInt(match[1])
    const seconds = parseInt(match[2])
    const timestamp = minutes * 60 + seconds
    // Remove timestamp from text
    const cleanText = text.replace(timestampRegex, '').trim()
    return { timestamp, cleanText }
  }
  
  return { timestamp: null, cleanText: text }
}

/**
 * Create a single segment with default values
 */
function createSegment(text: string, index: number): TranscriptionSegment {
  const { timestamp, cleanText } = extractTimestamp(text)
  
  // If we have an explicit timestamp from the text, use it
  // Otherwise, we'll use a more conservative estimate that doesn't inflate the total duration
  const start = timestamp !== null ? timestamp : index * 1 // Use extracted timestamp or estimate 1s per segment
  
  // Calculate end time based on text length (roughly 0.15s per word)
  // This is a more conservative estimate to avoid inflating the total duration
  const wordCount = cleanText.split(/\s+/).length
  const estimatedDuration = Math.max(0.5, wordCount * 0.15) // At least 0.5 second duration
  const end = start + estimatedDuration
  
  return {
    id: index,
    seek: 0,
    start,
    end,
    text: cleanText,
    tokens: [],
    temperature: 0,
    avg_logprob: 0,
    compression_ratio: 0,
    no_speech_prob: 0
  }
} 
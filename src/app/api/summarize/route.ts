import { NextRequest, NextResponse } from "next/server"
import { APIError } from "openai"
import { openai } from "@/services/openai"

// Log API key status for debugging (without exposing the full key)
const apiKey = process.env.OPENAI_API_KEY
console.log(`OpenAI API Key status:`, {
  defined: typeof apiKey !== 'undefined',
  length: apiKey?.length || 0,
  prefix: apiKey?.substring(0, 7) || 'missing',
  // NEVER log the full API key
})

/**
 * API route handler for summarizing transcription text
 * 
 * This endpoint accepts:
 * - text: The transcription text to summarize
 * - model: The OpenAI model to use (gpt-4o-mini or gpt-4o)
 * - prompt: The prompt template to use for summarization
 *   (supplied from src/lib/prompts/summarization/*)
 * 
 * @param req The Next.js request object
 * @returns A JSON response with the generated summary
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json()
    const { text, model, prompt } = body

    // Validate required fields
    if (!text) {
      return NextResponse.json(
        { error: "Missing transcription text" },
        { status: 400 }
      )
    }

    if (!model) {
      return NextResponse.json(
        { error: "Missing model selection" },
        { status: 400 }
      )
    }

    // Validate model is supported
    if (model !== "gpt-4o-mini" && model !== "gpt-4o") {
      return NextResponse.json(
        { error: "Unsupported model. Supported models: gpt-4o-mini, gpt-4o" },
        { status: 400 }
      )
    }

    // Create the full prompt with context and instructions
    let fullPrompt = prompt || "Summarize the following transcription:"
    fullPrompt += "\n\n" + text

    console.log(`Sending request to OpenAI with model: ${model}`)

    // Call OpenAI API to generate the summary
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that creates clear, concise, and accurate summaries."
        },
        {
          role: "user",
          content: fullPrompt
        }
      ],
      temperature: 0.3, // Lower temperature for more focused summaries
      max_tokens: 1000, // Limit summary length
    })

    // Extract the summary from the response
    const summary = response.choices[0]?.message?.content?.trim() || ""

    // Return the summary
    return NextResponse.json({ summary })
  } catch (error: any) {
    console.error("Error generating summary:", error)
    
    // Handle OpenAI API errors
    if (error instanceof APIError) {
      console.error(`OpenAI API error details:`, {
        status: error.status,
        message: error.message,
        type: error.type,
      })
      
      return NextResponse.json(
        { error: `OpenAI API error: ${error.message}` },
        { status: error.status || 500 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to generate summary: " + (error.message || "Unknown error") },
      { status: 500 }
    )
  }
} 
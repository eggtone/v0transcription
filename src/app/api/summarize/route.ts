import { NextRequest, NextResponse } from "next/server"
import { APIError } from "openai"
import { v4 as uuidv4 } from 'uuid'
import logger from '@/utils/logger'
import { openai, getOpenAIApiKey } from "@/services/openai"
import { z } from "zod"

// Define Zod schema for the request body
const SummarizeRequestSchema = z.object({
  text: z.string().min(1, "Transcription text cannot be empty"),
  model: z.enum(["gpt-4o-mini", "gpt-4o"], { 
    errorMap: () => ({ message: "Invalid model. Supported models: gpt-4o-mini, gpt-4o" })
  }),
  prompt: z.string().optional(), // Optional prompt string
})

// Log API key status once on startup (moved from top-level)
// This is better than logging on every request if the key doesn't change.
// Note: In serverless environments, this might still log frequently.
try {
  const keyInfo = getOpenAIApiKey()
  logger.info(
    { 
      defined: Boolean(keyInfo),
      length: keyInfo.length,
      prefix: keyInfo.substring(0, 7) // Log prefix safely
    },
    "OpenAI API Key status on startup"
  )
} catch (error) {
   logger.error({ error }, "OpenAI API Key not configured on startup")
}

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
  const requestId = uuidv4()
  const handlerLogger = logger.child({ requestId, route: '/api/summarize' })

  handlerLogger.info('Summarization request received')

  try {
    const body = await req.json()

    // Validate request body using Zod
    const validationResult = SummarizeRequestSchema.safeParse(body)

    if (!validationResult.success) {
      handlerLogger.warn({ errors: validationResult.error.errors }, 'Invalid summarization request body')
      return NextResponse.json(
        { error: "Invalid request body", details: validationResult.error.flatten() },
        { status: 400 }
      )
    }

    // Use validated data
    const { text, model, prompt } = validationResult.data
    handlerLogger.debug({ model, hasPrompt: Boolean(prompt) }, 'Validated summarization request')

    // Create the full prompt with context and instructions
    let fullPrompt = prompt || "Summarize the following transcription:"
    fullPrompt += "\n\n" + text

    handlerLogger.info({ model }, `Sending request to OpenAI`)

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

    handlerLogger.info({ model, summaryLength: summary.length }, `OpenAI summarization successful`)

    // Return the summary
    return NextResponse.json({ summary })
  } catch (error: any) {
    handlerLogger.error({ err: error }, "Error generating summary")
    
    // Handle OpenAI API errors
    if (error instanceof APIError) {
      handlerLogger.error(
        { status: error.status, message: error.message, type: error.type }, 
        `OpenAI API error details`
      )
      
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
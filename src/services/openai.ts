import OpenAI from "openai";

// Helper function to safely get the API key with validation
export function getOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured in environment variables");
  }
  
  // Simple format validation (should start with "sk-")
  if (!apiKey.startsWith("sk-")) {
    console.warn("Warning: OpenAI API key has an unexpected format. Keys usually start with 'sk-'");
  }
  
  return apiKey;
}

// Create a configured OpenAI client with proper error handling
export function createOpenAIClient(): OpenAI {
  try {
    const apiKey = getOpenAIApiKey();
    
    // Log key status (safely without exposing the full key)
    console.log("Creating OpenAI client with API key:", {
      defined: Boolean(apiKey),
      length: apiKey.length,
      prefix: apiKey.substring(0, 7), // Just show "sk-proj" or similar
    });
    
    return new OpenAI({
      apiKey: apiKey,
    });
  } catch (error) {
    console.error("Error creating OpenAI client:", error);
    throw error;
  }
}

// Export a pre-configured client for convenience
export const openai = createOpenAIClient(); 
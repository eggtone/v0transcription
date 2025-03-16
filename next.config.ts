/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include any other Next.js config options here
  serverExternalPackages: ['openai-whisper'],
  
  // Add environment variables
  env: {
    // Use the exact value from .env file without any modifications
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_API_BASE_URL: process.env.GROQ_API_BASE_URL,
    WHISPER_LOCAL_MODELS: process.env.WHISPER_LOCAL_MODELS,
  }
};

export default nextConfig;

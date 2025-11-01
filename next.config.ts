/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include any other Next.js config options here
  serverExternalPackages: ['openai-whisper'],

  // Temporarily ignore ESLint during build to verify structure works
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Point Next.js to client source for pages (moved from experimental)
  outputFileTracingRoot: __dirname,

  // Add environment variables
  env: {
    // Use the exact value from .env file without any modifications
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_API_BASE_URL: process.env.GROQ_API_BASE_URL,
    WHISPER_LOCAL_MODELS: process.env.WHISPER_LOCAL_MODELS,
  },

  webpack: (config: any) => {
    // Add path aliases for webpack
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'client/src'),
      '@shared': require('path').resolve(__dirname, 'shared'),
      '@server': require('path').resolve(__dirname, 'server/src'),
    };
    return config;
  },
};

export default nextConfig;

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { ApiClient, DetailedTranscription } from '@/types';
import { createSegmentsFromText } from '@/utils';

/**
 * Groq client for whisper models
 */
export class GroqClient implements ApiClient {
  private client: OpenAI;
  private model: string;

  constructor(model: string) {
    // Map from our UI model names to Groq model names
    // According to Groq docs, only these models are supported:
    // - distil-whisper-large-v3-en (English only)
    // - whisper-large-v3 (Multilingual)
    const modelMap: Record<string, string> = {
      'groq-distill-whisper': 'distil-whisper-large-v3-en',
      'groq-whisper-large-v3': 'whisper-large-v3',
      'groq-whisper-large': 'whisper-large-v3' // Fallback to v3 as v2 is not listed in docs
    };

    this.model = modelMap[model] || 'whisper-large-v3';
    
    console.log(`Mapped model ${model} to Groq model: ${this.model}`);
    
    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY || '',
      baseURL: process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1'
    });
  }

  async transcribeAudio(audioData: Buffer, filename: string): Promise<DetailedTranscription> {
    try {
      console.log(`Using Groq with model: ${this.model}`);
      
      // Create a temporary file to store the audio data
      const tmpDir = path.join(os.tmpdir(), 'groq-temp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      // Ensure the file has a valid audio extension that Groq accepts
      const validExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.flac', '.ogg', '.opus'];
      let fileExtension = path.extname(filename).toLowerCase();
      
      // If no extension or invalid extension, default to .mp3
      if (!fileExtension || !validExtensions.includes(fileExtension)) {
        fileExtension = '.mp3';
      }
      
      const tempFilePath = path.join(tmpDir, `${uuidv4()}${fileExtension}`);
      fs.writeFileSync(tempFilePath, audioData);
      
      console.log(`Saved audio to temporary file: ${tempFilePath}`);
      
      try {
        // Use the file path with OpenAI SDK
        console.log(`Sending transcription request to Groq with model: ${this.model}`);
        
        // First try with verbose_json to get segments
        let response;
        let hasSegments = false;
        
        try {
          response = await this.client.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: this.model,
            response_format: 'verbose_json',
            temperature: 0.0
          });
          console.log('Transcription with verbose_json successful');
          hasSegments = true;
        } catch (error) {
          console.log('verbose_json not supported, falling back to standard json', error);
          // Fallback to standard json if verbose_json is not supported
          response = await this.client.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: this.model,
            response_format: 'json',
            temperature: 0.0
          });
          console.log('Transcription with json successful');
        }
        
        // Parse and return the detailed response
        let detailedResponse: DetailedTranscription;
        
        if (typeof response === 'string') {
          // If it's a string, assume it's a JSON string
          try {
            const parsedResponse = JSON.parse(response);
            console.log('Parsed response:', Object.keys(parsedResponse));
            
            if (parsedResponse.segments && Array.isArray(parsedResponse.segments)) {
              // We got segments directly
              detailedResponse = parsedResponse as DetailedTranscription;
            } else {
              // We only got text, create manual segments
              detailedResponse = createSegmentsFromText(parsedResponse.text || parsedResponse);
            }
          } catch (error) {
            console.error('Error parsing response:', error);
            // If parsing fails, treat as plain text
            detailedResponse = createSegmentsFromText(response);
          }
        } else if (hasSegments && response && typeof response === 'object') {
          // This might be the verbose_json response
          if ('segments' in response && Array.isArray(response.segments)) {
            detailedResponse = response as unknown as DetailedTranscription;
          } else {
            console.log('Response has no segments property:', response);
            detailedResponse = createSegmentsFromText(response.text || '');
          }
        } else if (response && 'text' in response) {
          // Handle the case when we get a simple text response
          console.log('Got simple text response');
          detailedResponse = createSegmentsFromText(response.text);
        } else {
          console.error('Unexpected response format:', response);
          throw new Error('Unexpected response format from Groq API');
        }
        
        return detailedResponse;
      } finally {
        // Clean up the temporary file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    } catch (error) {
      console.error('Error transcribing with Groq:', error);
      throw error;
    }
  }
}

/**
 * Factory function to create the appropriate client based on the model
 */
export function createApiClient(model: string): ApiClient {
  if (model.startsWith('groq-')) {
    return new GroqClient(model);
  }
  
  throw new Error(`Unsupported model type: ${model}`);
} 
# V0 Audio Transcription App

This app provides audio transcription using Whisper models, both locally and through the Groq API.

## Features

- Audio file upload and playback
- Transcription using various Whisper models
- Local transcription for smaller models (Tiny to Medium)
- Cloud-based transcription via Groq for larger models
- Multiple display modes for transcription results:
  - Compact: All text in a single paragraph
  - Segments: Each segment on a separate line
  - Segments with Time: Timestamps shown for each segment
- Copy and download transcription results

## Model Options

### Local Models (run on your machine)
- Whisper Tiny (Fast)
- Whisper Base
- Whisper Small
- Whisper Medium

### Groq API Models (requires API key)
- Distill Whisper - English Only (faster)
- Whisper Large v3 - Multilingual
- Whisper Large - Best Quality

## Setup

1. Clone the repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root of your project with the following variables:
```
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# API Base URLs
GROQ_API_BASE_URL=https://api.groq.com/openai/v1

# Local Whisper Settings
WHISPER_LOCAL_MODELS=tiny,base,small,medium
```

4. Run the development server:
```bash
npm run dev
```

## Local Whisper Requirements

To use local Whisper models, you need to have the OpenAI Whisper package installed:

```bash
pip install openai-whisper
```

The first time you use a model, it will be downloaded automatically.

## Display Modes

The application provides three different ways to view transcription results:

1. **Compact Mode**: Shows all transcribed text in a single paragraph, ideal for reading or copying the entire content.

2. **Segments Mode**: Breaks down the transcription into logical segments or sentences, each displayed on a separate line.

3. **Segments with Time Mode**: Adds timestamps to each segment, showing when in the audio each segment occurs. Format: `[MM:SS] Text segment`.

You can toggle between these modes without having to re-transcribe your audio.

## API Endpoints

### POST /api/transcribe

Transcribes an audio file using the specified model.

**Request Body**:
- `file`: The audio file to transcribe
- `model`: The model to use for transcription (e.g., `whisper-tiny`, `groq-whisper-large-v3`)

**Response**:
```json
{
  "transcription": {
    "text": "The complete transcribed text",
    "segments": [
      {
        "id": 0,
        "start": 0.0,
        "end": 5.0,
        "text": "A segment of the transcription"
      },
      // Additional segments...
    ],
    "language": "en"
  }
}
```

## Supported Groq Models

According to Groq documentation, the following models are supported:
- `distil-whisper-large-v3-en` - Optimized for English, faster processing
- `whisper-large-v3` - Full multilingual support

## License

MIT

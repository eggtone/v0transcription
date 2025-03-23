# System Patterns

## Architecture Overview
The V0 Audio Transcription App follows a modern React/Next.js architecture with a clear separation of concerns between the frontend UI components, API routes for server-side processing, and service layers for external integrations.

```
┌───────────────────┐
│     Frontend      │
│   (React/Next.js) │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│    API Routes     │
│    (Next.js)      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐       ┌───────────────────┐
│  Service Layer    │ ────▶ │  External APIs    │
│                   │       │ (Groq, YouTube)   │
└─────────┬─────────┘       └───────────────────┘
          │
          ▼
┌───────────────────┐
│  Local Processing │
│  (Whisper Models) │
└───────────────────┘
```

## Component Structure
The application is structured with a focus on reusability and separation of concerns:

1. **Audio Acquisition Components**
   - Audio file upload
   - YouTube extraction

2. **Processing Components**
   - Transcription configuration
   - Model selection
   - Progress indicators

3. **Display Components**
   - Transcription display with multiple formats
   - Editing capabilities
   - Audio player with visualization

4. **Output Components**
   - Download functionality
   - Copy to clipboard
   - Summarization

## Key Design Patterns

### 1. Service Layer Pattern
The application uses dedicated service modules to abstract away the complexity of interacting with external APIs and local processing:

- `whisper.ts`: Handles local Whisper model interactions
- `api-client.ts`: Provides unified API client interface
- `youtube.ts`: Manages YouTube URL processing and audio extraction

This pattern ensures that API interactions are consistent and testable, and business logic is separated from API implementation details.

### 2. API Route Pattern
Next.js API routes are used as the backend for the application, handling:

- File uploads and processing
- Transcription requests
- YouTube audio extraction
- Summarization requests

Each API route is focused on a specific task, promoting maintainability and separation of concerns.

### 3. Component Composition
The UI is built using a component composition pattern, where smaller, focused components are composed together to build more complex interfaces:

- Base UI components (Button, Card, Input, etc.)
- Functional components (AudioPlayer, TranscriptionDisplay)
- Page-level components (AudioTranscription)

### 4. State Management
The application primarily uses React's built-in useState and useEffect hooks for state management, with a focus on component-local state where possible.

For more complex state, such as transcription data, the state is lifted up to parent components and passed down as props.

## Data Flow

1. **Audio Upload Flow**
   ```
   User → Upload Component → File API → Local Storage → Audio Player
   ```

2. **YouTube Extraction Flow**
   ```
   User → YouTube URL Input → YouTube API Route → External YouTube APIs → Local Storage → Audio Player
   ```

3. **Transcription Flow**
   ```
   User → Model Selection → Transcribe Button → Transcription API Route → Whisper/Groq Service → Transcription Results → Display Component
   ```

4. **Summarization Flow**
   ```
   User → Summary Request → Summarization API Route → OpenAI Service → Summary Results → Display Component
   ```

## Error Handling
The application implements several error handling patterns:

1. **Graceful Degradation**: Fallbacks from GPU to CPU processing if errors occur
2. **User Feedback**: Clear error messages displayed to users
3. **Timeout Handling**: Long-running processes have timeout mechanisms
4. **API Error Handling**: Structured error responses from API routes

## Performance Optimizations

1. **Client-side File Processing**: Audio files are processed on the client side when possible
2. **Streaming Audio**: Audio playback uses streaming to handle large files
3. **Lazy Loading**: Components are loaded only when needed
4. **Proper Cleanup**: Resources like object URLs are properly revoked when no longer needed

## Security Patterns

1. **Server-side API Key Storage**: API keys are stored server-side in environment variables
2. **Input Validation**: All user inputs are validated before processing
3. **Temporary File Handling**: Files are stored in temporary directories and cleaned up after use 
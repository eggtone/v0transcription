import { create } from 'zustand';
// Import base type from central location
import { QueuedAudioItem, DetailedTranscription, TranscriptionSegment } from '@shared/types';

// Interface extending QueuedAudioItem for store state
export interface EnhancedQueuedAudioItem extends QueuedAudioItem {
  extractionError?: string; // Added to store extraction-specific errors
  // Add transcription-specific fields managed by the store/processor
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  transcriptionData?: DetailedTranscription | null; // Allow null for clearing
  transcriptionError?: string;
  transcriptionTime?: number;

  // ++ Fields for resumable split transcription ++
  lastCompletedPartIndex?: number | null; // Index of the last successfully processed part
  // Store results of completed parts (text, processing time, segments, duration)
  partResults?: { 
    text: string; 
    processingTime: number; 
    segments?: TranscriptionSegment[]; // Store segments for reconstruction
    duration: number; // Store duration for time offset reconstruction
  }[];
}

// Define the store's state shape
interface BatchQueueState {
  audioQueue: EnhancedQueuedAudioItem[];
  selectedModel: string;
  isProcessingBatch: boolean;
  currentProcessingId: string | null; // ID of the item currently being processed in a batch
  processingMode: 'on-demand' | 'batch'; // New: processing mode selection
  batchJobId?: string; // New: track current batch job
  batchStatus?: 'preparing' | 'uploading' | 'submitted' | 'processing' | 'completed' | 'failed' | 'expired'; // New: batch job status
  completionWindow: '24h' | '7d'; // New: batch completion window
}

// Define the store's actions
interface BatchQueueActions {
  addToQueue: (item: QueuedAudioItem) => void; // Takes base type
  removeFromQueue: (id: string) => void;
  updateQueueOrder: (items: EnhancedQueuedAudioItem[]) => void;
  updateItem: (id: string, updates: Partial<EnhancedQueuedAudioItem>) => void; // Updates enhanced type
  setSelectedModel: (model: string) => void;
  setProcessingStatus: (isProcessing: boolean, currentId?: string | null) => void;
  clearQueue: () => void;
  clearItemResult: (id: string) => void; // Resets transcription status and data
  getQueue: () => EnhancedQueuedAudioItem[];
  getItemById: (id: string) => EnhancedQueuedAudioItem | undefined;
  // New: processing mode actions
  setProcessingMode: (mode: 'on-demand' | 'batch') => void;
  setBatchJob: (jobId: string, status?: string) => void;
  clearBatchJob: () => void;
  setCompletionWindow: (window: '24h' | '7d') => void;
}

// Create the Zustand store
export const useBatchQueueStore = create<BatchQueueState & BatchQueueActions>((set, get) => ({
  // Initial State
  audioQueue: [],
  selectedModel: "groq-distil-whisper", // Default model
  isProcessingBatch: false,
  currentProcessingId: null,
  processingMode: 'batch', // Default to batch processing
  batchJobId: undefined,
  batchStatus: undefined,
  completionWindow: '24h', // Default to 24 hour completion window

  // Actions
  // When adding, cast the base item and set initial transcription status
  addToQueue: (item) => set((state) => ({
    audioQueue: [
      ...state.audioQueue, 
      { 
        ...item, 
        transcriptionStatus: 'pending',
        lastCompletedPartIndex: null, // Initialize new fields
        partResults: []             // Initialize new fields
      } as EnhancedQueuedAudioItem // Cast to enhanced type
    ]
  })),
  
  removeFromQueue: (id) => set((state) => ({
    audioQueue: state.audioQueue.filter((item) => item.id !== id)
  })),
  
  updateQueueOrder: (items) => set({ audioQueue: items }), // Assumes items are already Enhanced
  
  updateItem: (id, updates) => set((state) => {
    const itemExists = state.audioQueue.some(item => item.id === id);
    if (!itemExists) {
      console.warn(`[Store Update Skipped] Item ${id} no longer in queue.`);
      return state; // Return current state without modification
    }
    
    return {
      audioQueue: state.audioQueue.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    };
  }),

  setSelectedModel: (model) => set({ selectedModel: model }),
  
  setProcessingStatus: (isProcessing, currentId = null) => set((state) => {
    // When starting a new batch, set the currentProcessingId
    // When stopping, clear it
    return {
      isProcessingBatch: isProcessing,
      currentProcessingId: isProcessing ? currentId : null
    }
  }),

  clearQueue: () => set({ 
    audioQueue: [], 
    isProcessingBatch: false, 
    currentProcessingId: null,
    batchJobId: undefined,
    batchStatus: undefined
  }),

  clearItemResult: (id) => set((state) => ({
    audioQueue: state.audioQueue.map((item) =>
      item.id === id 
        ? { 
            ...item, 
            transcriptionStatus: 'pending', 
            transcriptionData: null, 
            transcriptionError: undefined, 
            transcriptionTime: undefined,
            lastCompletedPartIndex: null, // Also clear partial results on reset
            partResults: []             // Also clear partial results on reset
          } as EnhancedQueuedAudioItem // Ensure type consistency
        : item
    )
  })),

  // New: processing mode actions
  setProcessingMode: (mode) => set({ processingMode: mode }),
  
  setBatchJob: (jobId, status) => set((state) => ({
    batchJobId: jobId,
    batchStatus: (status as BatchQueueState['batchStatus']) || state.batchStatus
  })),
  
  clearBatchJob: () => set({
    batchJobId: undefined,
    batchStatus: undefined
  }),

  setCompletionWindow: (window) => set({ completionWindow: window }),

  // Selectors
  getQueue: () => get().audioQueue,
  getItemById: (id) => get().audioQueue.find(item => item.id === id),
}));

// Export the base type too, if needed elsewhere, though importing from @/types is preferred
export type { QueuedAudioItem }; 
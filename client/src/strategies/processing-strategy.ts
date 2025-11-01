import { EnhancedQueuedAudioItem } from "@/stores/batchQueueStore";

/**
 * Processing status information
 */
export interface ProcessingStatus {
  mode: 'on-demand' | 'batch';
  isProcessing: boolean;
  progress: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    pending: number;
    percentage: number;
  };
  currentItem?: {
    id: string;
    name: string;
    progress: number;
  };
  batchJob?: {
    id: string;
    status: string;
    estimatedCompletion?: string;
  };
}

/**
 * Processing strategy interface for different transcription modes
 */
export interface ProcessingStrategy {
  /**
   * Check if the strategy can process the given items
   */
  canProcess(items: EnhancedQueuedAudioItem[]): boolean;

  /**
   * Process the given items using this strategy
   */
  processItems(items: EnhancedQueuedAudioItem[]): Promise<void>;

  /**
   * Get current processing status
   */
  getStatusSummary(): ProcessingStatus;

  /**
   * Stop current processing (if possible)
   */
  stopProcessing(): Promise<void>;

  /**
   * Clean up resources
   */
  cleanup(): void;

  /**
   * Check if processing can be stopped
   */
  canStop(): boolean;

  /**
   * Get strategy-specific configuration options
   */
  getConfigOptions(): {
    supportedModels: string[];
    requiresApiKey: boolean;
    supportsBatchProcessing: boolean;
    estimatedCostPer100MB?: number;
  };
}

/**
 * Base class for processing strategies with common functionality
 */
export abstract class BaseProcessingStrategy implements ProcessingStrategy {
  protected isProcessing = false;
  protected processedCount = 0;
  protected failedCount = 0;
  protected totalCount = 0;
  protected currentItemId: string | null = null;

  abstract canProcess(items: EnhancedQueuedAudioItem[]): boolean;
  abstract processItems(items: EnhancedQueuedAudioItem[]): Promise<void>;
  abstract stopProcessing(): Promise<void>;
  abstract getConfigOptions(): {
    supportedModels: string[];
    requiresApiKey: boolean;
    supportsBatchProcessing: boolean;
    estimatedCostPer100MB?: number;
  };

  getStatusSummary(): ProcessingStatus {
    const pending = this.totalCount - this.processedCount - this.failedCount;
    const processing = this.isProcessing ? 1 : 0;
    
    return {
      mode: this.getMode(),
      isProcessing: this.isProcessing,
      progress: {
        total: this.totalCount,
        completed: this.processedCount,
        failed: this.failedCount,
        processing,
        pending,
        percentage: this.totalCount > 0 ? (this.processedCount / this.totalCount) * 100 : 0
      },
      currentItem: this.currentItemId ? {
        id: this.currentItemId,
        name: this.getCurrentItemName(),
        progress: this.getCurrentItemProgress()
      } : undefined
    };
  }

  canStop(): boolean {
    return this.isProcessing;
  }

  cleanup(): void {
    this.isProcessing = false;
    this.processedCount = 0;
    this.failedCount = 0;
    this.totalCount = 0;
    this.currentItemId = null;
  }

  protected abstract getMode(): 'on-demand' | 'batch';
  protected abstract getCurrentItemName(): string;
  protected abstract getCurrentItemProgress(): number;
}

/**
 * Factory for creating processing strategies
 */
export class ProcessingStrategyFactory {
  static async create(mode: 'on-demand' | 'batch'): Promise<ProcessingStrategy> {
    switch (mode) {
      case 'on-demand':
        const { OnDemandProcessor } = await import('./on-demand-processor');
        return new OnDemandProcessor();
      case 'batch':
        const { GroqBatchProcessor } = await import('./groq-batch-processor');
        return new GroqBatchProcessor();
      default:
        throw new Error(`Unknown processing mode: ${mode}`);
    }
  }
}

export default ProcessingStrategy;
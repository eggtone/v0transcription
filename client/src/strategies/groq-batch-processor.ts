import { BaseProcessingStrategy, ProcessingStatus } from "./processing-strategy";
import { EnhancedQueuedAudioItem, useBatchQueueStore } from "@/stores/batchQueueStore";
import { toast } from "sonner";

/**
 * Groq batch processing strategy that submits files to Groq's batch API
 * for cost-effective processing with 50% savings compared to on-demand
 */
export class GroqBatchProcessor extends BaseProcessingStrategy {
  private currentItemName = "";
  private currentItemProgress = 0;
  private batchJobId: string | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private updateItem: (id: string, updates: Partial<EnhancedQueuedAudioItem>) => void;
  private getItemById: (id: string) => EnhancedQueuedAudioItem | undefined;
  private setProcessingStatus: (isProcessing: boolean, currentId?: string | null) => void;
  private setBatchJob: (jobId: string, status?: string) => void;
  private clearBatchJob: () => void;

  constructor() {
    super();
    // Get store actions
    const store = useBatchQueueStore.getState();
    this.updateItem = store.updateItem;
    this.getItemById = store.getItemById;
    this.setProcessingStatus = store.setProcessingStatus;
    this.setBatchJob = store.setBatchJob;
    this.clearBatchJob = store.clearBatchJob;
  }

  canProcess(items: EnhancedQueuedAudioItem[]): boolean {
    // Groq batch can process items that have files and aren't currently processing
    // Batch processing works best with Groq models only
    return items.some(item => 
      item.file && 
      item.extractionStatus !== 'extracting' && 
      item.extractionStatus !== 'downloading' && 
      item.transcriptionStatus !== 'processing'
    );
  }

  async processItems(items: EnhancedQueuedAudioItem[]): Promise<void> {
    const processableItems = items.filter(item => 
      item.file && 
      item.extractionStatus !== 'extracting' && 
      item.extractionStatus !== 'downloading' && 
      item.transcriptionStatus !== 'processing' &&
      item.transcriptionStatus !== 'completed' &&
      (item.transcriptionStatus === 'pending' || item.transcriptionStatus === 'failed')
    );

    if (processableItems.length === 0) {
      toast.info("No items ready for batch processing.");
      return;
    }

    // Check if we're using a Groq model
    const selectedModel = useBatchQueueStore.getState().selectedModel;
    if (!selectedModel.startsWith('groq-')) {
      toast.error("Batch processing requires a Groq model. Please select a Groq model first.");
      return;
    }

    this.isProcessing = true;
    this.totalCount = processableItems.length;
    this.processedCount = 0;
    this.failedCount = 0;

    toast.info(`Submitting batch job with ${processableItems.length} item(s)...`);
    this.setProcessingStatus(true);

    try {
      // Submit batch job to Groq
      const batchJobId = await this.submitBatchJob(processableItems, selectedModel);
      this.batchJobId = batchJobId;
      this.setBatchJob(batchJobId, 'submitted');

      toast.success(`Batch job submitted successfully! Job ID: ${batchJobId.slice(0, 8)}...`);
      
      // Start polling for results
      await this.startPolling();

    } catch (error) {
      console.error("Error during batch processing:", error);
      toast.error(`Batch submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.isProcessing = false;
      this.setProcessingStatus(false);
      this.clearBatchJob();
    }
  }

  async stopProcessing(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isProcessing = false;
    this.setProcessingStatus(false);
    toast.warning("Batch processing polling stopped. The batch job will continue processing in the background.");
  }

  getConfigOptions() {
    return {
      supportedModels: [
        "groq-distil-whisper",
        "groq-whisper-large-v3",
        "groq-whisper-large-v3-turbo"
      ],
      requiresApiKey: true,
      supportsBatchProcessing: true,
      estimatedCostPer100MB: 0.005 // 50% cost savings compared to on-demand
    };
  }

  getStatusSummary(): ProcessingStatus {
    const baseStatus = super.getStatusSummary();
    
    // Add batch-specific information
    if (this.batchJobId) {
      const batchStatus = useBatchQueueStore.getState().batchStatus;
      return {
        ...baseStatus,
        batchJob: {
          id: this.batchJobId,
          status: batchStatus || 'preparing',
          estimatedCompletion: this.getEstimatedCompletion()
        }
      };
    }
    
    return baseStatus;
  }

  protected getMode(): 'on-demand' | 'batch' {
    return 'batch';
  }

  protected getCurrentItemName(): string {
    return this.currentItemName;
  }

  protected getCurrentItemProgress(): number {
    return this.currentItemProgress;
  }

  private async submitBatchJob(items: EnhancedQueuedAudioItem[], model: string): Promise<string> {
    // Get completion window from store
    const completionWindow = useBatchQueueStore.getState().completionWindow;
    
    // Prepare form data for batch submission
    const formData = new FormData();
    formData.append('model', model);
    formData.append('completionWindow', completionWindow);
    formData.append('metadata', JSON.stringify({
      submittedAt: new Date().toISOString(),
      totalItems: items.length,
      processingMode: 'batch',
      completionWindow: completionWindow
    }));

    // Add files to form data
    items.forEach((item, index) => {
      if (item.file) {
        // Use the actual file name for consistency with batch API
        formData.append(`file_${index}`, item.file, item.file.name);
        // Mark items as processing but preserve local file for package downloads
        this.updateItem(item.id, {
          transcriptionStatus: 'processing',
          transcriptionError: undefined,
          // Keep the local file reference for package downloads
          // file: item.file is preserved (don't clear it)
        });
      }
    });

    // Submit to batch API
    const response = await fetch('/api/batch/submit', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Batch submission failed with status ${response.status}`);
    }

    const result = await response.json();
    return result.jobId;
  }

  private async startPolling(): Promise<void> {
    if (!this.batchJobId) return;

    const pollInterval = 30000; // Poll every 30 seconds
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollBatchStatus();
      } catch (error) {
        console.error("Error polling batch status:", error);
        // Continue polling unless it's a critical error
      }
    }, pollInterval);

    // Do an initial poll
    setTimeout(async () => {
      try {
        await this.pollBatchStatus();
      } catch (error) {
        console.error("Error in initial batch status poll:", error);
      }
    }, 5000); // Wait 5 seconds before first poll
  }

  private async pollBatchStatus(): Promise<void> {
    if (!this.batchJobId) return;

    try {
      const response = await fetch(`/api/batch/${this.batchJobId}/status`);
      
      if (!response.ok) {
        throw new Error(`Status check failed with status ${response.status}`);
      }

      const status = await response.json();
      
      // Update batch status in store
      this.setBatchJob(this.batchJobId, status.status);

      switch (status.status) {
        case 'completed':
          await this.handleBatchCompletion();
          break;
        case 'failed':
          await this.handleBatchFailure(status.error);
          break;
        case 'expired':
          await this.handleBatchExpiration();
          break;
        case 'processing':
          // Update progress if available
          if (status.progress?.percentage !== undefined) {
            this.processedCount = status.progress.completed || 0;
            this.failedCount = status.progress.failed || 0;
            toast.info(`Batch processing: ${status.progress.percentage}% complete`);
          }
          break;
        // Other statuses ('preparing', 'uploading', 'submitted') - continue polling
      }
    } catch (error) {
      console.error("Error polling batch status:", error);
      toast.error("Error checking batch status. Will continue polling...");
    }
  }

  private async handleBatchCompletion(): Promise<void> {
    if (!this.batchJobId) return;

    try {
      toast.info("Batch processing completed! Retrieving results...");
      
      const response = await fetch(`/api/batch/${this.batchJobId}/results?format=json`);
      
      if (!response.ok) {
        throw new Error(`Results retrieval failed with status ${response.status}`);
      }

      const data = await response.json();
      
      // The API response structure includes completed and failed items
      if (data.results) {
        // Process completed results
        for (const result of data.results) {
          if (result.result && result.status === 'completed') {
            // Parse the transcription result
            const transcriptionData = typeof result.result === 'string' 
              ? JSON.parse(result.result) 
              : result.result;
            
            // Find the corresponding queue item by filename
            const queueItem = useBatchQueueStore.getState().audioQueue.find(
              item => item.file?.name === result.originalFilename
            );
            
            if (queueItem) {
              // Try to find the blob URL from batch items
              const batchJobId = this.batchJobId;
              let blobUrl = queueItem.url; // Keep existing URL if any
              
              // If we have access to batch items with blob URLs, use them
              if (batchJobId) {
                try {
                  // The blob URL should be stored in the database during batch submission
                  // For now, we'll use the existing URL or leave it as-is
                  // This preserves any existing blob URLs from the original upload
                } catch (error) {
                  console.warn('Could not retrieve blob URL for completed item:', error);
                }
              }
              
              this.updateItem(queueItem.id, {
                transcriptionStatus: 'completed',
                transcriptionData: transcriptionData,
                transcriptionTime: 0, // Batch processing doesn't provide individual timing
                // Preserve the url if it exists for audio download
                ...(blobUrl && { url: blobUrl })
              });
              this.processedCount++;
            }
          } else if (result.status === 'failed') {
            // Find the corresponding queue item by filename
            const queueItem = useBatchQueueStore.getState().audioQueue.find(
              item => item.file?.name === result.originalFilename
            );
            
            if (queueItem) {
              this.updateItem(queueItem.id, {
                transcriptionStatus: 'failed',
                transcriptionError: result.errorMessage || 'Batch processing failed'
              });
              this.failedCount++;
            }
          }
        }
      }

      toast.success(`Batch processing completed! ${this.processedCount} items processed successfully.`);
      
      // Send email notification
      await this.sendCompletionNotification('completed');
      
    } catch (error) {
      console.error("Error retrieving batch results:", error);
      toast.error("Error retrieving batch results. Please check individual items.");
    } finally {
      this.cleanup();
    }
  }

  private async handleBatchFailure(error?: string): Promise<void> {
    toast.error(`Batch processing failed: ${error || 'Unknown error'}`);
    
    // Mark all processing items as failed
    const queue = useBatchQueueStore.getState().audioQueue;
    for (const item of queue) {
      if (item.transcriptionStatus === 'processing') {
        this.updateItem(item.id, {
          transcriptionStatus: 'failed',
          transcriptionError: `Batch job failed: ${error || 'Unknown error'}`
        });
        this.failedCount++;
      }
    }
    
    // Send email notification for failure
    await this.sendCompletionNotification('failed', error);
    
    this.cleanup();
  }

  private async handleBatchExpiration(): Promise<void> {
    toast.warning("Batch job expired. Items will need to be reprocessed.");
    
    // Mark all processing items as failed
    const queue = useBatchQueueStore.getState().audioQueue;
    for (const item of queue) {
      if (item.transcriptionStatus === 'processing') {
        this.updateItem(item.id, {
          transcriptionStatus: 'failed',
          transcriptionError: 'Batch job expired'
        });
        this.failedCount++;
      }
    }
    
    // Send email notification for expiration
    await this.sendCompletionNotification('expired');
    
    this.cleanup();
  }

  private getEstimatedCompletion(): string {
    const batchStatus = useBatchQueueStore.getState().batchStatus;
    
    if (batchStatus === 'processing') {
      // Estimate based on typical batch processing time
      const estimatedMinutes = Math.ceil(this.totalCount * 2); // ~2 minutes per item
      const completionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
      return completionTime.toLocaleTimeString();
    }
    
    return 'Unknown';
  }

  private async sendCompletionNotification(
    status: 'completed' | 'failed' | 'expired', 
    errorMessage?: string
  ): Promise<void> {
    if (!this.batchJobId) {
      console.warn('[GroqBatchProcessor] Cannot send notification: no batch job ID');
      return;
    }

    try {
      // Send notification via API endpoint (server-side)
      const notification = {
        jobId: this.batchJobId,
        status,
        totalItems: this.totalCount,
        completedItems: this.processedCount,
        failedItems: this.failedCount,
        timestamp: new Date().toISOString(),
        errorMessage
      };

      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`[GroqBatchProcessor] Email notification sent for batch ${status}`);
        toast.success(`Email notification sent to ${result.emailAddress || 'configured address'}`);
      } else {
        const error = await response.json();
        console.warn('[GroqBatchProcessor] Email notification failed:', error.error);
        toast.warning('Batch completed, but email notification failed to send');
      }
      
    } catch (error) {
      console.error('[GroqBatchProcessor] Failed to send email notification:', error);
      toast.warning('Batch completed, but email notification failed to send');
    }
  }

  cleanup(): void {
    super.cleanup();
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.batchJobId = null;
    this.setProcessingStatus(false);
    this.clearBatchJob();
  }
}
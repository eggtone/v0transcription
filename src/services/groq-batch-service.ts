import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/utils/logger';
import { BatchJob, BatchItem, batchJobQueries, batchItemQueries } from '@/lib/database';
import { DetailedTranscription } from '@/types';

// Groq batch service types
export interface BatchSubmissionItem {
  filename: string;
  originalFilename: string;
  audioBuffer: Buffer;
  model: string;
}

export interface BatchJobResult {
  jobId: string;
  status: string;
  totalItems: number;
  items: BatchItem[];
}

export interface BatchSubmissionOptions {
  model: string;
  completionWindow?: '24h' | '7d'; // Groq processing window
  metadata?: any;
}

export class GroqBatchService {
  private client: OpenAI;
  private tempDir: string;

  constructor() {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is required for batch processing');
    }

    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1'
    });

    this.tempDir = path.join(os.tmpdir(), 'transcriptor-batch');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Upload audio file to public storage for batch processing
   */
  private async uploadFileForBatch(audioBuffer: Buffer, originalFilename: string): Promise<{
    url: string;
    fileName: string;
  }> {
    const serviceLogger = logger.child({ originalFilename });
    
    try {
      // Create a File object from the buffer
      const file = new File([audioBuffer], originalFilename, {
        type: 'audio/mpeg' // Default, will be validated by upload endpoint
      });

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload to our public storage endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/upload-for-batch`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Upload failed: ${errorData.error}`);
      }

      const uploadResult = await response.json();
      serviceLogger.info({ publicUrl: uploadResult.url }, '[GroqBatchService] File uploaded to public storage');
      
      return {
        url: uploadResult.url,
        fileName: uploadResult.fileName
      };
    } catch (error) {
      serviceLogger.error({ error }, '[GroqBatchService] Failed to upload file to public storage');
      throw error;
    }
  }

  /**
   * Submit a batch of audio files for transcription
   */
  async submitBatch(
    items: BatchSubmissionItem[], 
    options: BatchSubmissionOptions
  ): Promise<string> {
    const jobId = uuidv4();
    const serviceLogger = logger.child({ jobId, itemCount: items.length });
    
    serviceLogger.info('[GroqBatchService] Starting batch submission');

    try {
      // 1. Create batch job record
      batchJobQueries.create.run(
        jobId,
        'preparing',
        options.model,
        items.length,
        JSON.stringify(options.metadata || {})
      );

      // 2. Create batch items and save audio files
      const batchItems: BatchItem[] = [];
      const jsonlRequests: any[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemId = uuidv4();
        const customId = `${jobId}_${i}`;
        
        serviceLogger.info({ customId, filename: item.filename }, '[GroqBatchService] Uploading file to public storage');

        // Upload file to public storage for Groq access
        const uploadResult = await this.uploadFileForBatch(item.audioBuffer, item.originalFilename);

        // Create batch item record with public URL
        batchItemQueries.create.run(
          itemId,
          jobId,
          customId,
          uploadResult.url, // Store the full public URL for cleanup
          item.originalFilename,
          item.audioBuffer.length,
          'pending'
        );

        batchItems.push({
          id: itemId,
          batch_job_id: jobId,
          custom_id: customId,
          filename: uploadResult.url, // Store the full public URL
          original_filename: item.originalFilename,
          file_size: item.audioBuffer.length,
          status: 'pending',
          created_at: new Date().toISOString()
        });

        // Create JSONL request entry with public URL
        jsonlRequests.push({
          custom_id: customId,
          method: 'POST',
          url: '/v1/audio/transcriptions',
          body: {
            model: this.mapModelName(options.model),
            url: uploadResult.url, // Use public URL for Groq to access
            response_format: 'verbose_json'
          }
        });

        serviceLogger.info({ 
          customId, 
          publicUrl: uploadResult.url,
          filename: item.originalFilename 
        }, '[GroqBatchService] Created batch item with public URL');
      }

      serviceLogger.info('[GroqBatchService] Created batch items, preparing JSONL file');

      // 3. Create JSONL file
      const jsonlContent = jsonlRequests.map(req => JSON.stringify(req)).join('\n');
      const jsonlPath = path.join(this.tempDir, `batch_${jobId}.jsonl`);
      fs.writeFileSync(jsonlPath, jsonlContent);

      // 4. Upload JSONL file to Groq
      batchJobQueries.updateStatus.run('uploading', 'uploading', 'uploading', null, null, jobId);
      
      const fileUpload = await this.client.files.create({
        file: fs.createReadStream(jsonlPath),
        purpose: 'batch'
      });

      serviceLogger.info({ fileId: fileUpload.id }, '[GroqBatchService] JSONL file uploaded');

      // 5. Create batch job with Groq
      const batchJob = await this.client.batches.create({
        input_file_id: fileUpload.id,
        endpoint: '/v1/audio/transcriptions',
        completion_window: options.completionWindow || '24h'
      });

      serviceLogger.info({ groqBatchId: batchJob.id }, '[GroqBatchService] Batch job submitted to Groq');

      // 6. Update job status
      batchJobQueries.updateStatus.run(
        'submitted', 
        'submitted', 
        'submitted', 
        batchJob.id, 
        null, 
        jobId
      );

      // 7. Clean up temporary JSONL file
      fs.unlinkSync(jsonlPath);

      serviceLogger.info('[GroqBatchService] Batch submission completed successfully');
      return jobId;

    } catch (error) {
      serviceLogger.error({ error }, '[GroqBatchService] Error during batch submission');
      
      // Update job status to failed
      batchJobQueries.updateStatus.run(
        'failed', 
        'failed', 
        'failed', 
        null, 
        error instanceof Error ? error.message : String(error), 
        jobId
      );
      
      throw error;
    }
  }

  /**
   * Check the status of a batch job
   */
  async checkBatchStatus(jobId: string): Promise<BatchJobResult> {
    const serviceLogger = logger.child({ jobId });
    
    const job = batchJobQueries.findById.get(jobId) as BatchJob;
    if (!job) {
      throw new Error(`Batch job ${jobId} not found`);
    }

    const items = batchItemQueries.findByBatchId.all(jobId) as BatchItem[];

    // If job has Groq batch ID, check status with Groq
    // Always check Groq for non-failed jobs to ensure we get the latest status
    if (job.groq_batch_id && !['failed', 'expired', 'cancelled'].includes(job.status)) {
      try {
        const groqBatch = await this.client.batches.retrieve(job.groq_batch_id);
        serviceLogger.debug({ groqStatus: groqBatch.status }, '[GroqBatchService] Retrieved Groq batch status');

        // Update local status based on Groq status
        await this.updateJobStatusFromGroq(jobId, groqBatch);
        
        // Re-fetch updated job data
        const updatedJob = batchJobQueries.findById.get(jobId) as BatchJob;
        return {
          jobId,
          status: updatedJob.status,
          totalItems: updatedJob.total_items,
          items: batchItemQueries.findByBatchId.all(jobId) as BatchItem[]
        };
      } catch (error) {
        serviceLogger.error({ error }, '[GroqBatchService] Error checking Groq batch status');
      }
    }

    return {
      jobId,
      status: job.status,
      totalItems: job.total_items,
      items
    };
  }

  /**
   * Retrieve results for a completed batch job
   */
  async getBatchResults(jobId: string): Promise<BatchItem[]> {
    const job = batchJobQueries.findById.get(jobId) as BatchJob;
    if (!job) {
      throw new Error(`Batch job ${jobId} not found`);
    }

    if (job.status !== 'completed') {
      throw new Error(`Batch job ${jobId} is not completed (status: ${job.status})`);
    }

    return batchItemQueries.findByBatchId.all(jobId) as BatchItem[];
  }

  /**
   * Process completed batch results from Groq
   */
  private async updateJobStatusFromGroq(jobId: string, groqBatch: any): Promise<void> {
    const serviceLogger = logger.child({ jobId, groqBatchId: groqBatch.id });
    
    // Map Groq status to our status
    const statusMap: Record<string, string> = {
      'validating': 'processing',
      'in_progress': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'expired': 'expired'
    };

    const newStatus = statusMap[groqBatch.status] || groqBatch.status;

    if (groqBatch.status === 'completed' && groqBatch.output_file_id) {
      // Download and process results
      await this.processCompletedBatch(jobId, groqBatch.output_file_id);
    } else if (groqBatch.status === 'completed' && !groqBatch.output_file_id) {
      // Batch completed but no output file - mark pending items as failed
      const pendingItems = items.filter(item => item.status === 'pending');
      for (const item of pendingItems) {
        batchItemQueries.updateStatus.run(
          'failed',
          'failed',
          null,
          'Groq batch completed without output file',
          item.id
        );
      }
    }

    // Update job status
    batchJobQueries.updateStatus.run(
      newStatus, 
      newStatus, 
      newStatus, 
      null, 
      groqBatch.error_message || null, 
      jobId
    );

    serviceLogger.info({ newStatus }, '[GroqBatchService] Updated job status from Groq');
  }

  /**
   * Download and process completed batch results
   */
  private async processCompletedBatch(jobId: string, outputFileId: string): Promise<void> {
    const serviceLogger = logger.child({ jobId, outputFileId });
    
    try {
      // Download results file
      const fileContent = await this.client.files.content(outputFileId);
      const resultsText = await fileContent.text();
      
      // Parse JSONL results
      const results = resultsText
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      serviceLogger.info({ resultCount: results.length }, '[GroqBatchService] Processing batch results');

      // Get all items for this batch
      const allItems = batchItemQueries.findByBatchId.all(jobId) as BatchItem[];
      const processedCustomIds = new Set<string>();

      // Update individual items that have results
      for (const result of results) {
        const customId = result.custom_id;
        const item = allItems.find(i => i.custom_id === customId);
        
        if (!item) {
          serviceLogger.warn({ customId }, '[GroqBatchService] Item not found for result');
          continue;
        }

        processedCustomIds.add(customId);

        if (result.error) {
          // Handle error case
          batchItemQueries.updateStatus.run(
            'failed',
            'failed',
            null,
            result.error.message || 'Unknown error',
            item.id
          );
        } else {
          // Handle success case
          const transcription = result.response.body;
          const detailedResult: DetailedTranscription = {
            text: transcription.text || '',
            language: transcription.language || 'en',
            segments: transcription.segments || [],
            processingTime: 0
          };

          batchItemQueries.updateStatus.run(
            'completed',
            'completed',
            JSON.stringify(detailedResult),
            null,
            item.id
          );
        }
      }

      // Mark any items not included in results as failed
      for (const item of allItems) {
        if (!processedCustomIds.has(item.custom_id) && item.status === 'pending') {
          serviceLogger.warn({ customId: item.custom_id }, '[GroqBatchService] Item not processed by Groq, marking as failed');
          batchItemQueries.updateStatus.run(
            'failed',
            'failed',
            null,
            'Item was not processed by Groq batch service',
            item.id
          );
        }
      }

      // Update job progress
      const progress = batchItemQueries.getProgress.get(jobId) as any;
      batchJobQueries.updateProgress.run(
        progress.completed,
        progress.failed,
        jobId
      );

      // Clean up temporary audio files
      const items = batchItemQueries.findByBatchId.all(jobId) as BatchItem[];
      for (const item of items) {
        try {
          if (fs.existsSync(item.filename)) {
            fs.unlinkSync(item.filename);
          }
        } catch (error) {
          serviceLogger.warn({ filename: item.filename, error }, '[GroqBatchService] Error cleaning up temp file');
        }
      }

      serviceLogger.info('[GroqBatchService] Batch results processed successfully');

    } catch (error) {
      serviceLogger.error({ error }, '[GroqBatchService] Error processing completed batch');
      throw error;
    }
  }

  /**
   * Map internal model names to Groq model names
   */
  private mapModelName(model: string): string {
    const modelMap: Record<string, string> = {
      'groq-distil-whisper': 'distil-whisper-large-v3-en',
      'groq-whisper-large-v3': 'whisper-large-v3',
      'groq-whisper-large-v3-turbo': 'whisper-large-v3-turbo'
    };

    return modelMap[model] || model;
  }

  /**
   * List all batch jobs
   */
  async listBatchJobs(limit: number = 50): Promise<BatchJob[]> {
    return batchJobQueries.listAll.all(limit) as BatchJob[];
  }

  /**
   * Cancel a pending batch job
   */
  async cancelBatch(jobId: string): Promise<void> {
    const job = batchJobQueries.findById.get(jobId) as BatchJob;
    if (!job) {
      throw new Error(`Batch job ${jobId} not found`);
    }

    if (job.groq_batch_id && ['submitted', 'processing'].includes(job.status)) {
      try {
        await this.client.batches.cancel(job.groq_batch_id);
      } catch (error) {
        logger.warn({ jobId, error }, '[GroqBatchService] Error canceling Groq batch');
      }
    }

    batchJobQueries.updateStatus.run('failed', 'failed', 'failed', null, 'Cancelled by user', jobId);
  }
}

export default GroqBatchService;
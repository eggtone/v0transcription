import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import logger from '@server/lib/logger';
import GroqBatchService, { BatchSubmissionItem } from '@server/services/groq-batch-service';

// Validation schema for batch submission
const BatchSubmitSchema = z.object({
  model: z.string().min(1, "Model is required")
    .refine(model => model.startsWith('groq-'), "Only Groq models support batch processing"),
  completionWindow: z.enum(['24h', '7d']).optional().default('24h'),
  metadata: z.record(z.any()).optional()
});

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const handlerLogger = logger.child({ requestId, route: '/api/batch/submit' });

  handlerLogger.info('[BatchSubmit] Batch submission request received');

  try {
    // Parse form data
    const formData = await request.formData();
    const modelOption = formData.get('model') as string;
    const completionWindow = formData.get('completionWindow') as string || '24h';
    const metadata = formData.get('metadata') ? JSON.parse(formData.get('metadata') as string) : {};

    // Validate basic parameters
    const validation = BatchSubmitSchema.safeParse({
      model: modelOption,
      completionWindow,
      metadata
    });

    if (!validation.success) {
      handlerLogger.warn({ errors: validation.error.errors }, '[BatchSubmit] Invalid request data');
      const errorMessages = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json(
        { error: `Invalid request data: ${errorMessages}` },
        { status: 400 }
      );
    }

    const { model, completionWindow: validCompletionWindow, metadata: validMetadata } = validation.data;

    // Extract audio files
    const files: File[] = [];
    const fileEntries = Array.from(formData.entries()).filter(([key, value]) => 
      key.startsWith('file_') && value instanceof File
    );

    if (fileEntries.length === 0) {
      handlerLogger.warn('[BatchSubmit] No audio files provided');
      return NextResponse.json(
        { error: 'At least one audio file is required' },
        { status: 400 }
      );
    }

    handlerLogger.info({ fileCount: fileEntries.length, model }, '[BatchSubmit] Processing batch submission');

    // Convert files to BatchSubmissionItem format
    const batchItems: BatchSubmissionItem[] = [];
    
    for (const [key, file] of fileEntries) {
      if (!(file instanceof File)) continue;
      
      // Validate file
      if (file.size === 0) {
        handlerLogger.warn({ filename: file.name }, '[BatchSubmit] Empty file detected');
        return NextResponse.json(
          { error: `File ${file.name} is empty` },
          { status: 400 }
        );
      }

      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        handlerLogger.warn({ filename: file.name, size: file.size }, '[BatchSubmit] File too large');
        return NextResponse.json(
          { error: `File ${file.name} exceeds 100MB limit` },
          { status: 400 }
        );
      }

      // Convert to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      batchItems.push({
        filename: `${Date.now()}_${file.name}`,
        originalFilename: file.name,
        audioBuffer: buffer,
        model
      });
    }

    handlerLogger.info({ itemCount: batchItems.length }, '[BatchSubmit] Prepared batch items');

    // Submit batch to Groq
    const batchService = new GroqBatchService();
    const jobId = await batchService.submitBatch(batchItems, {
      model,
      completionWindow: validCompletionWindow,
      metadata: {
        ...validMetadata,
        submittedBy: 'api',
        requestId
      }
    });

    handlerLogger.info({ jobId }, '[BatchSubmit] Batch submitted successfully');

    return NextResponse.json({
      success: true,
      jobId,
      totalItems: batchItems.length,
      model,
      completionWindow: validCompletionWindow,
      message: 'Batch submitted successfully. Processing will begin shortly.',
      // Include file mapping for client to update queue items with blob URLs
      fileMapping: batchItems.map(item => ({
        originalFilename: item.originalFilename,
        filename: item.filename
      }))
    });

  } catch (error) {
    handlerLogger.error({ error }, '[BatchSubmit] Error during batch submission');
    
    return NextResponse.json(
      { 
        error: `Batch submission failed: ${error instanceof Error ? error.message : String(error)}`,
        requestId 
      },
      { status: 500 }
    );
  }
}
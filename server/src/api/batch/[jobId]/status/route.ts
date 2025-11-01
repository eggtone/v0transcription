import { NextRequest, NextResponse } from 'next/server';
import logger from '@server/lib/logger';
import GroqBatchService from '@/services/groq-batch-service';

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const handlerLogger = logger.child({ jobId, route: '/api/batch/[jobId]/status' });

  handlerLogger.info('[BatchStatus] Status check request received');

  try {
    if (!jobId || typeof jobId !== 'string') {
      handlerLogger.warn('[BatchStatus] Invalid job ID provided');
      return NextResponse.json(
        { error: 'Valid job ID is required' },
        { status: 400 }
      );
    }

    const batchService = new GroqBatchService();
    const result = await batchService.checkBatchStatus(jobId);

    // Calculate progress percentage
    const completedItems = result.items.filter(item => item.status === 'completed').length;
    const failedItems = result.items.filter(item => item.status === 'failed').length;
    const processingItems = result.items.filter(item => item.status === 'processing').length;
    const pendingItems = result.items.filter(item => item.status === 'pending').length;

    const progressPercent = result.totalItems > 0 
      ? Math.round(((completedItems + failedItems) / result.totalItems) * 100)
      : 0;

    handlerLogger.info({ 
      status: result.status, 
      completed: completedItems, 
      failed: failedItems, 
      progress: progressPercent 
    }, '[BatchStatus] Status retrieved');

    return NextResponse.json({
      jobId: result.jobId,
      status: result.status,
      progress: {
        total: result.totalItems,
        completed: completedItems,
        failed: failedItems,
        processing: processingItems,
        pending: pendingItems,
        percentage: progressPercent
      },
      items: result.items.map(item => ({
        id: item.id,
        customId: item.custom_id,
        originalFilename: item.original_filename,
        status: item.status,
        errorMessage: item.error_message,
        completedAt: item.completed_at,
        hasResult: !!item.result
      })),
      estimatedCompletion: calculateEstimatedCompletion(result.status, progressPercent),
      canCancel: ['preparing', 'uploading', 'submitted'].includes(result.status)
    });

  } catch (error) {
    handlerLogger.error({ error }, '[BatchStatus] Error checking batch status');
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: `Batch job ${jobId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: `Failed to check batch status: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

function calculateEstimatedCompletion(status: string, progressPercent: number): string | null {
  if (status === 'completed' || status === 'failed' || status === 'expired') {
    return null;
  }

  if (status === 'preparing' || status === 'uploading') {
    return 'Starting soon...';
  }

  if (status === 'submitted') {
    return 'Processing will begin within 1 hour';
  }

  if (status === 'processing') {
    if (progressPercent === 0) {
      return '1-24 hours remaining';
    } else if (progressPercent < 50) {
      return '30 minutes - 12 hours remaining';
    } else {
      return '10 minutes - 6 hours remaining';
    }
  }

  return null;
}
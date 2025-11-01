import { NextRequest, NextResponse } from 'next/server';
import logger from '@server/lib/logger';
import GroqBatchService from '@/services/groq-batch-service';

export async function POST(
  request: NextRequest, 
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const handlerLogger = logger.child({ jobId, route: '/api/batch/[jobId]/cancel' });

  handlerLogger.info('[BatchCancel] Cancel request received');

  try {
    if (!jobId || typeof jobId !== 'string') {
      handlerLogger.warn('[BatchCancel] Invalid job ID provided');
      return NextResponse.json(
        { error: 'Valid job ID is required' },
        { status: 400 }
      );
    }

    const batchService = new GroqBatchService();
    await batchService.cancelBatch(jobId);

    handlerLogger.info('[BatchCancel] Batch cancelled successfully');

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Batch job cancelled successfully'
    });

  } catch (error) {
    handlerLogger.error({ error }, '[BatchCancel] Error cancelling batch');
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: `Batch job ${jobId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: `Failed to cancel batch: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import logger from '@server/lib/logger';
import GroqBatchService from '@/services/groq-batch-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  
  const handlerLogger = logger.child({ limit, route: '/api/batch/list' });

  handlerLogger.info('[BatchList] List request received');

  try {
    if (isNaN(limit) || limit < 1 || limit > 100) {
      handlerLogger.warn({ limit }, '[BatchList] Invalid limit parameter');
      return NextResponse.json(
        { error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    const batchService = new GroqBatchService();
    const jobs = await batchService.listBatchJobs(limit);

    handlerLogger.info({ jobCount: jobs.length }, '[BatchList] Jobs retrieved');

    const responseJobs = jobs.map(job => ({
      id: job.id,
      groq_batch_id: job.groq_batch_id,
      status: job.status,
      model: job.model,
      total_items: job.total_items,
      completed_items: job.completed_items || 0,
      failed_items: job.failed_items || 0,
      created_at: job.created_at,
      updated_at: job.updated_at,
      submitted_at: job.submitted_at,
      completed_at: job.completed_at,
      error_message: job.error_message,
      completion_window: '24h', // Default, could be stored in metadata
      metadata: job.metadata ? (typeof job.metadata === 'string' ? JSON.parse(job.metadata) : job.metadata) : null,
      progressPercent: job.total_items > 0 
        ? Math.round(((job.completed_items + job.failed_items) / job.total_items) * 100)
        : 0,
      canCancel: ['preparing', 'uploading', 'submitted', 'validating'].includes(job.status),
      canDownload: job.status === 'completed' && (job.completed_items || 0) > 0
    }));

    return NextResponse.json({
      jobs: responseJobs,
      totalCount: responseJobs.length,
      activeJobs: responseJobs.filter(job => 
        ['preparing', 'uploading', 'submitted', 'processing'].includes(job.status)
      ).length
    });

  } catch (error) {
    handlerLogger.error({ error }, '[BatchList] Error listing batch jobs');
    
    return NextResponse.json(
      { error: `Failed to list batch jobs: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
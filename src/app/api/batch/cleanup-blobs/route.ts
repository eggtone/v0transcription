import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/logger';
import { batchJobQueries, batchItemQueries } from '@/lib/database';
import BlobCleanupService from '@/services/blob-cleanup-service';

export async function POST(request: NextRequest) {
  const handlerLogger = logger.child({ route: '/api/batch/cleanup-blobs' });
  
  handlerLogger.info('[BlobCleanup] Cleanup request received');

  try {
    const { maxAgeHours = 72 } = await request.json();

    // Find completed, failed, or expired jobs older than specified age
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
    
    // Get old completed/failed jobs
    const oldJobs = batchJobQueries.db.prepare(`
      SELECT id, status, created_at, completed_at
      FROM batch_jobs 
      WHERE status IN ('completed', 'failed', 'expired')
      AND (completed_at < ? OR (completed_at IS NULL AND created_at < ?))
    `).all(cutoffDate, cutoffDate);

    handlerLogger.info('[BlobCleanup] Found old jobs for cleanup', { 
      jobCount: oldJobs.length,
      maxAgeHours,
      cutoffDate 
    });

    let totalDeleted = 0;
    let totalFailed = 0;
    const cleanupResults = [];

    for (const job of oldJobs) {
      try {
        // Get items for this job
        const items = batchItemQueries.findByBatchId.all(job.id);
        
        if (items.length > 0) {
          handlerLogger.info('[BlobCleanup] Cleaning up blobs for job', {
            jobId: job.id,
            status: job.status,
            itemCount: items.length
          });

          const result = await BlobCleanupService.cleanupBatchJobBlobs(items);
          
          totalDeleted += result.deleted.length;
          totalFailed += result.failed.length;
          
          cleanupResults.push({
            jobId: job.id,
            status: job.status,
            itemCount: items.length,
            deleted: result.deleted.length,
            failed: result.failed.length
          });
        }
      } catch (error) {
        handlerLogger.error('[BlobCleanup] Error cleaning up job', { jobId: job.id, error });
        cleanupResults.push({
          jobId: job.id,
          status: job.status,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    handlerLogger.info('[BlobCleanup] Cleanup completed', {
      jobsProcessed: oldJobs.length,
      totalDeleted,
      totalFailed
    });

    return NextResponse.json({
      success: true,
      summary: {
        jobsProcessed: oldJobs.length,
        totalBlobsDeleted: totalDeleted,
        totalBlobsFailed: totalFailed,
        maxAgeHours,
        cutoffDate
      },
      details: cleanupResults
    });

  } catch (error) {
    handlerLogger.error('[BlobCleanup] Cleanup failed', { error });
    return NextResponse.json(
      { 
        error: 'Blob cleanup failed', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const handlerLogger = logger.child({ route: '/api/batch/cleanup-blobs' });
  
  try {
    // Get stats about blob usage
    const allJobs = batchJobQueries.listAll.all(1000); // Get up to 1000 jobs
    const completedJobs = allJobs.filter(job => ['completed', 'failed', 'expired'].includes(job.status));
    
    let totalItems = 0;
    let estimatedBlobCount = 0;

    for (const job of completedJobs) {
      const items = batchItemQueries.findByBatchId.all(job.id);
      totalItems += items.length;
      estimatedBlobCount += items.filter(item => item.filename && item.filename.startsWith('https://')).length;
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalJobs: allJobs.length,
        completedJobs: completedJobs.length,
        totalItems,
        estimatedBlobCount,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    handlerLogger.error('[BlobCleanup] Stats query failed', { error });
    return NextResponse.json(
      { error: 'Failed to get blob stats' },
      { status: 500 }
    );
  }
}
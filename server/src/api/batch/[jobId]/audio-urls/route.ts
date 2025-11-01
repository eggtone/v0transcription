import { NextRequest, NextResponse } from 'next/server';
import { batchItemQueries } from '@server/database';
import logger from '@server/lib/logger';

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const handlerLogger = logger.child({ jobId, route: '/api/batch/[jobId]/audio-urls' });

  try {
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json(
        { error: 'Valid job ID is required' },
        { status: 400 }
      );
    }

    // Get batch items with their blob URLs
    const items = batchItemQueries.findByBatchId.all(jobId) as any[];
    
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No items found for this batch job' },
        { status: 404 }
      );
    }

    // Return mapping of original filename to blob URL
    const audioUrls = items.map((item: any) => ({
      originalFilename: item.original_filename,
      blobUrl: item.filename, // The filename field contains the blob URL
      status: item.status
    })).filter((item: any) =>
      // Only return items that have blob URLs (start with https)
      item.blobUrl && item.blobUrl.startsWith('https://')
    );

    handlerLogger.info('[AudioUrls] Retrieved audio URLs', { 
      itemCount: items.length,
      urlCount: audioUrls.length 
    });

    return NextResponse.json({
      success: true,
      jobId,
      audioUrls
    });

  } catch (error) {
    handlerLogger.error('[AudioUrls] Error retrieving audio URLs', { error });
    return NextResponse.json(
      { error: 'Failed to retrieve audio URLs' },
      { status: 500 }
    );
  }
}
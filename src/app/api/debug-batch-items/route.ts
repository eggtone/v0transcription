import { NextRequest, NextResponse } from 'next/server';
import { batchItemQueries } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const items = batchItemQueries.findByBatchId.all(jobId);
    
    return NextResponse.json({
      success: true,
      jobId,
      itemCount: items.length,
      items: items.map(item => ({
        id: item.id,
        filename: item.filename,
        original_filename: item.original_filename,
        file_size: item.file_size,
        status: item.status,
        created_at: item.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching debug batch items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch items' },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // db is already imported
    
    // Check if batch job exists
    const batchJob = db.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(jobId);
    if (!batchJob) {
      return NextResponse.json(
        { error: 'Batch job not found' },
        { status: 404 }
      );
    }

    // Get all items for this batch job
    const items = db.prepare(`
      SELECT 
        id,
        custom_id,
        filename,
        original_filename,
        file_size,
        status,
        error_message,
        created_at,
        completed_at
      FROM batch_items 
      WHERE batch_job_id = ?
      ORDER BY created_at ASC
    `).all(jobId);

    console.log(`[Batch Items API] Retrieved ${items.length} items for batch job ${jobId}`);

    return NextResponse.json({
      success: true,
      batchJob: {
        id: batchJob.id,
        status: batchJob.status,
        model: batchJob.model,
        total_items: batchJob.total_items,
        created_at: batchJob.created_at
      },
      items: items
    });

  } catch (error) {
    console.error('[Batch Items API] Error fetching batch items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch items' },
      { status: 500 }
    );
  }
}
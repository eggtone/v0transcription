import { NextRequest, NextResponse } from 'next/server';
import logger from '@server/lib/logger';
import GroqBatchService from '@server/services/groq-batch-service';
import JSZip from 'jszip';

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json'; // json, txt, zip
  const handlerLogger = logger.child({ jobId, format, route: '/api/batch/[jobId]/results' });

  handlerLogger.info('[BatchResults] Results download request received');

  try {
    if (!jobId || typeof jobId !== 'string') {
      handlerLogger.warn('[BatchResults] Invalid job ID provided');
      return NextResponse.json(
        { error: 'Valid job ID is required' },
        { status: 400 }
      );
    }

    const batchService = new GroqBatchService();
    const items = await batchService.getBatchResults(jobId);

    const completedItems = items.filter(item => item.status === 'completed' && item.result);
    const failedItems = items.filter(item => item.status === 'failed');

    if (completedItems.length === 0) {
      handlerLogger.warn({ totalItems: items.length }, '[BatchResults] No completed items found');
      return NextResponse.json(
        { error: 'No completed transcriptions found for this batch' },
        { status: 404 }
      );
    }

    handlerLogger.info({ 
      completed: completedItems.length, 
      failed: failedItems.length,
      format 
    }, '[BatchResults] Preparing results');

    // Handle different response formats
    switch (format.toLowerCase()) {
      case 'json':
        return handleJsonFormat(completedItems, failedItems, jobId);
      
      case 'txt':
        return handleTextFormat(completedItems, jobId);
      
      case 'zip':
        return await handleZipFormat(completedItems, failedItems, jobId);
      
      default:
        return NextResponse.json(
          { error: 'Invalid format. Supported formats: json, txt, zip' },
          { status: 400 }
        );
    }

  } catch (error) {
    handlerLogger.error({ error }, '[BatchResults] Error retrieving batch results');
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: `Batch job ${jobId} not found` },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('not completed')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `Failed to retrieve batch results: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

function handleJsonFormat(completedItems: any[], failedItems: any[], jobId: string) {
  const results = {
    jobId,
    summary: {
      total: completedItems.length + failedItems.length,
      completed: completedItems.length,
      failed: failedItems.length
    },
    completedAt: new Date().toISOString(),
    results: completedItems.map(item => ({
      id: item.id,
      customId: item.custom_id,
      originalFilename: item.original_filename,
      transcription: JSON.parse(item.result),
      completedAt: item.completed_at
    })),
    failures: failedItems.map(item => ({
      id: item.id,
      customId: item.custom_id,
      originalFilename: item.original_filename,
      error: item.error_message,
      failedAt: item.completed_at
    }))
  };

  return NextResponse.json(results, {
    headers: {
      'Content-Disposition': `attachment; filename="batch_${jobId}_results.json"`,
      'Content-Type': 'application/json'
    }
  });
}

function handleTextFormat(completedItems: any[], jobId: string) {
  let textContent = `Batch Transcription Results - Job ID: ${jobId}\n`;
  textContent += `Generated: ${new Date().toISOString()}\n`;
  textContent += `Completed Items: ${completedItems.length}\n\n`;
  textContent += '='.repeat(80) + '\n\n';

  completedItems.forEach((item, index) => {
    const transcription = JSON.parse(item.result);
    textContent += `File ${index + 1}: ${item.original_filename}\n`;
    textContent += '-'.repeat(40) + '\n';
    textContent += `${transcription.text}\n\n`;
    
    if (transcription.segments && transcription.segments.length > 0) {
      textContent += 'Timestamps:\n';
      transcription.segments.forEach((segment: any) => {
        const startTime = formatTime(segment.start);
        const endTime = formatTime(segment.end);
        textContent += `[${startTime} - ${endTime}] ${segment.text}\n`;
      });
      textContent += '\n';
    }
    
    textContent += '='.repeat(80) + '\n\n';
  });

  return new NextResponse(textContent, {
    headers: {
      'Content-Disposition': `attachment; filename="batch_${jobId}_transcripts.txt"`,
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

async function handleZipFormat(completedItems: any[], failedItems: any[], jobId: string) {
  const zip = new JSZip();

  // Add summary file (will be updated later with audio file count)
  const summary = {
    jobId,
    generatedAt: new Date().toISOString(),
    summary: {
      total: completedItems.length + failedItems.length,
      completed: completedItems.length,
      failed: failedItems.length,
      audioFilesIncluded: 0 // Will be updated after processing
    }
  };

  let audioFilesAdded = 0;

  // Add individual transcription files and audio files
  for (const item of completedItems) {
    const transcription = JSON.parse(item.result);
    const filename = sanitizeFilename(item.original_filename);
    const baseName = filename.replace(/\.[^/.]+$/, ''); // Remove extension
    
    // JSON version
    zip.file(`transcriptions/${baseName}.json`, JSON.stringify(transcription, null, 2));
    
    // Text version
    let textContent = `Transcription: ${item.original_filename}\n`;
    textContent += `Completed: ${item.completed_at}\n\n`;
    textContent += `${transcription.text}\n\n`;
    
    if (transcription.segments && transcription.segments.length > 0) {
      textContent += 'Detailed Timestamps:\n';
      textContent += '-'.repeat(30) + '\n';
      transcription.segments.forEach((segment: any) => {
        const startTime = formatTime(segment.start);
        const endTime = formatTime(segment.end);
        textContent += `[${startTime} - ${endTime}] ${segment.text}\n`;
      });
    }
    
    zip.file(`transcriptions/${baseName}.txt`, textContent);

    // Try to add audio file from Vercel Blob
    if (item.filename && item.filename.startsWith('https://')) {
      try {
        const audioResponse = await fetch(item.filename);
        if (audioResponse.ok) {
          const audioBuffer = await audioResponse.arrayBuffer();
          const audioExtension = item.original_filename.split('.').pop() || 'mp3';
          zip.file(`audio/${baseName}.${audioExtension}`, audioBuffer);
          audioFilesAdded++;
        } else {
          logger.warn(`Failed to fetch audio file for ${item.original_filename}: ${audioResponse.status}`);
        }
      } catch (error) {
        logger.warn(`Error fetching audio file for ${item.original_filename}:`, error);
      }
    }
  }

  // Add failures file if any
  if (failedItems.length > 0) {
    const failuresContent = failedItems.map(item => ({
      originalFilename: item.original_filename,
      error: item.error_message,
      failedAt: item.completed_at
    }));
    zip.file('failures.json', JSON.stringify(failuresContent, null, 2));
  }

  // Update summary with audio file count
  summary.summary.audioFilesIncluded = audioFilesAdded;
  zip.file('summary.json', JSON.stringify(summary, null, 2));

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Disposition': `attachment; filename="batch_${jobId}_results.zip"`,
      'Content-Type': 'application/zip'
    }
  });
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
}
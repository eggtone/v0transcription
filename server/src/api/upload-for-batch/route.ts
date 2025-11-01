import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 
      'audio/aac', 'audio/ogg', 'audio/webm', 'audio/flac',
      'video/mp4', 'video/webm', 'video/mpeg'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported types: ${allowedTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `batch-audio/${timestamp}-${sanitizedName}`;

    console.log(`[Upload API] Uploading file: ${fileName} (${file.size} bytes)`);

    // Upload to Vercel Blob with public access
    const blob = await put(fileName, file, {
      access: 'public',
      addRandomSuffix: false, // We already have timestamp
    });

    console.log(`[Upload API] File uploaded successfully: ${blob.url}`);

    return NextResponse.json({
      success: true,
      url: blob.url,
      fileName: fileName,
      originalName: file.name,
      size: file.size,
      type: file.type
    });

  } catch (error) {
    console.error('[Upload API] Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
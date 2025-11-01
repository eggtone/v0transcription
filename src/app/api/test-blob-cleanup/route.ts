import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testPath } = body;
    
    if (!testPath) {
      return NextResponse.json({ error: 'testPath is required' }, { status: 400 });
    }

    console.log(`[TestBlobCleanup] Testing deletion of path: ${testPath}`);
    
    // Test direct deletion with the path
    try {
      console.log(`[TestBlobCleanup] Calling del() with path: ${testPath}`);
      const deleteResult = await del(testPath);
      console.log(`[TestBlobCleanup] del() returned:`, deleteResult);
      
      return NextResponse.json({
        success: true,
        testPath,
        result: 'deleted',
        deleteResult
      });
    } catch (error) {
      console.error(`[TestBlobCleanup] Failed to delete:`, error);
      return NextResponse.json({
        success: false,
        testPath,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: error instanceof Error && 'code' in error ? error.code : undefined,
          stack: error instanceof Error ? error.stack : undefined
        }
      });
    }
  } catch (error) {
    console.error('[TestBlobCleanup] Request error:', error);
    return NextResponse.json(
      { error: `Request failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
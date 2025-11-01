import { NextRequest, NextResponse } from 'next/server';
import logger from '@server/lib/logger';
import { BatchPoller } from '@/services/batch-poller';

// GET - Get poller status
export async function GET(request: NextRequest) {
  const handlerLogger = logger.child({ route: '/api/batch/poller' });

  try {
    const poller = BatchPoller.getInstance();
    const status = poller.getStatus();

    handlerLogger.info(status, '[BatchPollerAPI] Poller status retrieved');

    return NextResponse.json({
      ...status,
      message: status.isPolling ? 'Batch poller is active' : 'Batch poller is inactive'
    });

  } catch (error) {
    handlerLogger.error({ error }, '[BatchPollerAPI] Error getting poller status');
    
    return NextResponse.json(
      { error: `Failed to get poller status: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// POST - Control poller (start/stop/poll-once)
export async function POST(request: NextRequest) {
  const handlerLogger = logger.child({ route: '/api/batch/poller' });

  try {
    const body = await request.json();
    const { action, intervalMs } = body;

    if (!action || typeof action !== 'string') {
      handlerLogger.warn({ action }, '[BatchPollerAPI] Invalid action provided');
      return NextResponse.json(
        { error: 'Action is required (start, stop, or poll-once)' },
        { status: 400 }
      );
    }

    const poller = BatchPoller.getInstance();

    switch (action.toLowerCase()) {
      case 'start':
        const interval = intervalMs && typeof intervalMs === 'number' && intervalMs >= 5000 
          ? intervalMs 
          : 30000; // Default 30 seconds, minimum 5 seconds
        
        poller.startPolling(interval);
        handlerLogger.info({ intervalMs: interval }, '[BatchPollerAPI] Poller started');
        
        return NextResponse.json({
          success: true,
          message: 'Batch poller started successfully',
          intervalMs: interval
        });

      case 'stop':
        poller.stopPolling();
        handlerLogger.info('[BatchPollerAPI] Poller stopped');
        
        return NextResponse.json({
          success: true,
          message: 'Batch poller stopped successfully'
        });

      case 'poll-once':
        await poller.pollOnce();
        handlerLogger.info('[BatchPollerAPI] Single poll executed');
        
        return NextResponse.json({
          success: true,
          message: 'Single polling cycle completed'
        });

      default:
        handlerLogger.warn({ action }, '[BatchPollerAPI] Unknown action');
        return NextResponse.json(
          { error: 'Unknown action. Valid actions: start, stop, poll-once' },
          { status: 400 }
        );
    }

  } catch (error) {
    handlerLogger.error({ error }, '[BatchPollerAPI] Error controlling poller');
    
    return NextResponse.json(
      { error: `Failed to control poller: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
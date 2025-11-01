import { NextRequest, NextResponse } from 'next/server';
import { EmailService } from '@/services/email-service';
import { NotificationService } from '@/services/notification-service';
import logger from '@/utils/logger';

export async function POST(request: NextRequest) {
  const handlerLogger = logger.child({ route: '/api/test-email' });

  try {
    const emailAddress = process.env.EMAIL_NOFIFIER;
    
    if (!emailAddress) {
      return NextResponse.json(
        { error: 'EMAIL_NOFIFIER environment variable not configured' },
        { status: 400 }
      );
    }

    handlerLogger.info('[TestEmail] Testing email service');

    // Test connection first
    const emailService = EmailService.getInstance();
    const connectionTest = await emailService.testConnection();
    
    if (!connectionTest) {
      return NextResponse.json(
        { error: 'Email service connection failed. Check EMAIL_NOFIFIER and EMAIL_PASSWORD environment variables.' },
        { status: 500 }
      );
    }

    // Send test notification
    const notificationService = NotificationService.getInstance();
    const testResult = await notificationService.testNotification({
      email: emailAddress,
      browserNotification: false
    });

    if (testResult.success) {
      handlerLogger.info('[TestEmail] Test email sent successfully');
      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${emailAddress}`,
        connectionTest: true
      });
    } else {
      handlerLogger.error({ errors: testResult.errors }, '[TestEmail] Test email failed');
      return NextResponse.json(
        { 
          error: 'Test email failed',
          details: testResult.errors,
          connectionTest 
        },
        { status: 500 }
      );
    }

  } catch (error) {
    handlerLogger.error({ error }, '[TestEmail] Error testing email service');
    
    return NextResponse.json(
      { 
        error: `Email test failed: ${error instanceof Error ? error.message : String(error)}`,
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const emailAddress = process.env.EMAIL_NOFIFIER;
    const hasPassword = !!process.env.EMAIL_PASSWORD;
    
    return NextResponse.json({
      configured: !!emailAddress,
      emailAddress: emailAddress || 'Not configured',
      hasPassword: hasPassword,
      instructions: !emailAddress || !hasPassword ? 
        'Please set EMAIL_NOFIFIER and EMAIL_PASSWORD environment variables. For Gmail, use an App Password.' : 
        'Email service appears to be configured'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error checking email configuration' },
      { status: 500 }
    );
  }
}
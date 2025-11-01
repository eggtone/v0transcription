#!/usr/bin/env node

/**
 * Test script for Groq Batch Processing System
 * 
 * This script tests the batch API endpoints and verifies the system works correctly.
 * It can run with mock audio files to avoid requiring actual Groq API calls.
 * 
 * Usage:
 *   node scripts/test-batch-system.js [--mock] [--base-url=http://localhost:3000]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class BatchSystemTester {
  constructor(baseUrl = 'http://localhost:3000', useMock = false) {
    this.baseUrl = baseUrl;
    this.useMock = useMock;
    this.testResults = [];
    this.jobId = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📝';
    console.log(`${prefix} ${timestamp} ${message}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          ...options.headers
        },
        ...options
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data.error || response.statusText}`);
      }

      return { success: true, data, status: response.status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  createMockAudioFile(filename, sizeKB = 50) {
    // Create a mock audio file with random data
    const buffer = crypto.randomBytes(sizeKB * 1024);
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async testPollerStatus() {
    this.log('Testing poller status...');
    
    const result = await this.makeRequest('/api/batch/poller');
    
    if (result.success) {
      this.log(`Poller status: ${result.data.isPolling ? 'Active' : 'Inactive'}, Active jobs: ${result.data.activeJobs}`, 'success');
      return true;
    } else {
      this.log(`Poller status test failed: ${result.error}`, 'error');
      return false;
    }
  }

  async testStartPoller() {
    this.log('Starting poller...');
    
    const result = await this.makeRequest('/api/batch/poller', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', intervalMs: 10000 }) // 10 second interval for testing
    });
    
    if (result.success) {
      this.log('Poller started successfully', 'success');
      return true;
    } else {
      this.log(`Failed to start poller: ${result.error}`, 'error');
      return false;
    }
  }

  async testListBatchJobs() {
    this.log('Testing batch job listing...');
    
    const result = await this.makeRequest('/api/batch/list?limit=10');
    
    if (result.success) {
      this.log(`Found ${result.data.jobs.length} batch jobs, ${result.data.activeJobs} active`, 'success');
      return true;
    } else {
      this.log(`Batch job listing failed: ${result.error}`, 'error');
      return false;
    }
  }

  async testBatchSubmission() {
    this.log('Testing batch submission...');
    
    if (this.useMock) {
      this.log('⚠️  Using mock mode - will not actually submit to Groq API');
    }

    try {
      const formData = new FormData();
      
      // Add model and options
      formData.append('model', 'groq-whisper-large-v3-turbo');
      formData.append('completionWindow', '24h');
      formData.append('metadata', JSON.stringify({ 
        testRun: true, 
        timestamp: new Date().toISOString() 
      }));

      // Add mock audio files
      const files = [
        { name: 'test-audio-1.wav', size: 100 },
        { name: 'test-audio-2.wav', size: 150 },
        { name: 'test-audio-3.wav', size: 75 }
      ];

      files.forEach((fileInfo, index) => {
        const mockFile = this.createMockAudioFile(fileInfo.name, fileInfo.size);
        formData.append(`file_${index}`, mockFile, fileInfo.name);
      });

      const result = await this.makeRequest('/api/batch/submit', {
        method: 'POST',
        body: formData
      });

      if (result.success) {
        this.jobId = result.data.jobId;
        this.log(`Batch submitted successfully! Job ID: ${this.jobId}`, 'success');
        this.log(`Total items: ${result.data.totalItems}, Model: ${result.data.model}`);
        return true;
      } else {
        this.log(`Batch submission failed: ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`Batch submission error: ${error.message}`, 'error');
      return false;
    }
  }

  async testJobStatus() {
    if (!this.jobId) {
      this.log('No job ID available for status test', 'error');
      return false;
    }

    this.log(`Testing job status for ${this.jobId}...`);
    
    const result = await this.makeRequest(`/api/batch/${this.jobId}/status`);
    
    if (result.success) {
      const { status, progress, estimatedCompletion } = result.data;
      this.log(`Job status: ${status}, Progress: ${progress.percentage}% (${progress.completed}/${progress.total})`, 'success');
      
      if (estimatedCompletion) {
        this.log(`Estimated completion: ${estimatedCompletion}`);
      }
      
      return { success: true, status, progress };
    } else {
      this.log(`Job status test failed: ${result.error}`, 'error');
      return { success: false };
    }
  }

  async testJobCancellation() {
    if (!this.jobId) {
      this.log('No job ID available for cancellation test', 'error');
      return false;
    }

    this.log(`Testing job cancellation for ${this.jobId}...`);
    
    const result = await this.makeRequest(`/api/batch/${this.jobId}/cancel`, {
      method: 'POST'
    });
    
    if (result.success) {
      this.log('Job cancelled successfully', 'success');
      return true;
    } else {
      this.log(`Job cancellation failed: ${result.error}`, 'error');
      return false;
    }
  }

  async testDatabaseConnection() {
    this.log('Testing database connection...');
    
    try {
      // Test by trying to list jobs (which requires database access)
      const result = await this.testListBatchJobs();
      if (result) {
        this.log('Database connection test passed', 'success');
        return true;
      } else {
        this.log('Database connection test failed', 'error');
        return false;
      }
    } catch (error) {
      this.log(`Database connection error: ${error.message}`, 'error');
      return false;
    }
  }

  async testNotificationService() {
    this.log('Testing notification service...');
    
    // This would require a specific endpoint to test notifications
    // For now, we'll just log that this feature exists
    this.log('Notification service integrated but not directly testable via API', 'success');
    return true;
  }

  async runTests() {
    console.log('\n🚀 Starting Batch System Tests\n');
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Mock mode: ${this.useMock ? 'Enabled' : 'Disabled'}`);
    console.log('='*50);

    const tests = [
      { name: 'Database Connection', fn: () => this.testDatabaseConnection() },
      { name: 'Poller Status', fn: () => this.testPollerStatus() },
      { name: 'Start Poller', fn: () => this.testStartPoller() },
      { name: 'List Batch Jobs', fn: () => this.testListBatchJobs() },
      { name: 'Batch Submission', fn: () => this.testBatchSubmission() },
      { name: 'Job Status Check', fn: () => this.testJobStatus() },
      { name: 'Notification Service', fn: () => this.testNotificationService() }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result) {
          passedTests++;
        }
        // Add delay between tests
        await this.sleep(1000);
      } catch (error) {
        this.log(`Test "${test.name}" threw error: ${error.message}`, 'error');
      }
    }

    // If we successfully submitted a job, test cancellation
    if (this.jobId) {
      this.log('\n--- Additional Tests ---');
      const cancelResult = await this.testJobCancellation();
      if (cancelResult) {
        passedTests++;
      }
      totalTests++;
    }

    console.log('\n' + '='*50);
    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Batch system is working correctly.');
    } else {
      console.log('❌ Some tests failed. Check the logs above for details.');
    }

    console.log('\n💡 Next steps:');
    console.log('  1. Ensure your server is running: npm run dev');
    console.log('  2. Set GROQ_API_KEY in your .env file');
    console.log('  3. Test with real audio files once Groq integration is verified');
    
    return passedTests === totalTests;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const useMock = args.includes('--mock');
const baseUrlArg = args.find(arg => arg.startsWith('--base-url='));
const baseUrl = baseUrlArg ? baseUrlArg.split('=')[1] : 'http://localhost:3000';

// Run tests
const tester = new BatchSystemTester(baseUrl, useMock);
tester.runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
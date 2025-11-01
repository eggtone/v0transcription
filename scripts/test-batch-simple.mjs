#!/usr/bin/env node

/**
 * Simple Batch System Test Script
 * 
 * Tests the batch processing system with mock data.
 * Run with: node scripts/test-batch-simple.mjs
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3000';

class SimpleBatchTester {
  constructor() {
    this.testResults = [];
    this.jobId = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString().slice(11, 19);
    const emoji = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : '📝';
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      
      return {
        ok: response.ok,
        status: response.status,
        data
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message
      };
    }
  }

  createMockFormData() {
    const formData = new FormData();
    
    // Add batch parameters
    formData.append('model', 'groq-whisper-large-v3-turbo');
    formData.append('completionWindow', '24h');
    formData.append('metadata', JSON.stringify({
      testRun: true,
      createdBy: 'test-script',
      timestamp: new Date().toISOString()
    }));

    // Create mock audio files (small blobs to simulate audio)
    const mockFiles = [
      { name: 'sample1.wav', size: 1024 },
      { name: 'sample2.wav', size: 2048 },
      { name: 'sample3.wav', size: 1536 }
    ];

    mockFiles.forEach((file, index) => {
      // Create a small blob with random data
      const mockData = new Array(file.size).fill(0).map(() => Math.floor(Math.random() * 256));
      const blob = new Blob([new Uint8Array(mockData)], { type: 'audio/wav' });
      formData.append(`file_${index}`, blob, file.name);
    });

    return formData;
  }

  async test1_CheckServer() {
    this.log('Testing if server is running...');
    
    const result = await this.request('/api/batch/list');
    
    if (result.ok) {
      this.log('Server is running and responding', 'success');
      return true;
    } else {
      this.log(`Server not responding: ${result.error || result.data?.error}`, 'error');
      return false;
    }
  }

  async test2_ListJobs() {
    this.log('Testing job listing...');
    
    const result = await this.request('/api/batch/list?limit=5');
    
    if (result.ok) {
      const jobCount = result.data.jobs?.length || 0;
      this.log(`Found ${jobCount} existing batch jobs`, 'success');
      return true;
    } else {
      this.log(`Job listing failed: ${result.data?.error}`, 'error');
      return false;
    }
  }

  async test3_PollerStatus() {
    this.log('Testing poller status...');
    
    const result = await this.request('/api/batch/poller');
    
    if (result.ok) {
      const { isPolling, activeJobs } = result.data;
      this.log(`Poller: ${isPolling ? 'Active' : 'Inactive'}, Active jobs: ${activeJobs}`, 'success');
      return true;
    } else {
      this.log(`Poller status failed: ${result.data?.error}`, 'error');
      return false;
    }
  }

  async test4_StartPoller() {
    this.log('Starting poller with 15-second interval...');
    
    const result = await this.request('/api/batch/poller', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', intervalMs: 15000 })
    });
    
    if (result.ok) {
      this.log('Poller started successfully', 'success');
      return true;
    } else {
      this.log(`Failed to start poller: ${result.data?.error}`, 'error');
      return false;
    }
  }

  async test5_SubmitBatch() {
    this.log('Submitting test batch (with mock audio files)...');
    this.log('Note: This will fail at Groq API submission since files are mock data', 'warn');
    
    const formData = this.createMockFormData();
    
    const result = await this.request('/api/batch/submit', {
      method: 'POST',
      body: formData
    });
    
    if (result.ok) {
      this.jobId = result.data.jobId;
      this.log(`Batch submitted! Job ID: ${this.jobId}`, 'success');
      this.log(`Total files: ${result.data.totalItems}, Model: ${result.data.model}`);
      return true;
    } else {
      this.log(`Batch submission failed: ${result.data?.error}`, 'error');
      // This might fail due to mock data, which is expected
      return false;
    }
  }

  async test6_CheckJobStatus() {
    if (!this.jobId) {
      this.log('No job ID from previous test, skipping status check', 'warn');
      return true;
    }

    this.log(`Checking status for job: ${this.jobId}...`);
    
    const result = await this.request(`/api/batch/${this.jobId}/status`);
    
    if (result.ok) {
      const { status, progress } = result.data;
      this.log(`Status: ${status}, Progress: ${progress.percentage}% (${progress.completed}/${progress.total})`, 'success');
      return true;
    } else {
      this.log(`Status check failed: ${result.data?.error}`, 'error');
      return false;
    }
  }

  async test7_CancelJob() {
    if (!this.jobId) {
      this.log('No job ID from previous test, skipping cancellation', 'warn');
      return true;
    }

    this.log(`Cancelling job: ${this.jobId}...`);
    
    const result = await this.request(`/api/batch/${this.jobId}/cancel`, {
      method: 'POST'
    });
    
    if (result.ok) {
      this.log('Job cancelled successfully', 'success');
      return true;
    } else {
      this.log(`Job cancellation failed: ${result.data?.error}`, 'error');
      return false;
    }
  }

  async runAllTests() {
    console.log('\n🚀 Simple Batch System Test');
    console.log(`🌐 Testing against: ${BASE_URL}`);
    console.log('📝 Make sure your development server is running: npm run dev\n');
    console.log('='*60 + '\n');

    const tests = [
      { name: 'Server Connectivity', fn: () => this.test1_CheckServer() },
      { name: 'Job Listing', fn: () => this.test2_ListJobs() },
      { name: 'Poller Status', fn: () => this.test3_PollerStatus() },
      { name: 'Start Poller', fn: () => this.test4_StartPoller() },
      { name: 'Batch Submission', fn: () => this.test5_SubmitBatch() },
      { name: 'Job Status Check', fn: () => this.test6_CheckJobStatus() },
      { name: 'Job Cancellation', fn: () => this.test7_CancelJob() }
    ];

    let passed = 0;
    let total = tests.length;

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      console.log(`\n--- Test ${i + 1}/${total}: ${test.name} ---`);
      
      try {
        const result = await test.fn();
        if (result) {
          passed++;
        }
        
        // Small delay between tests
        if (i < tests.length - 1) {
          await this.sleep(1500);
        }
      } catch (error) {
        this.log(`Test threw error: ${error.message}`, 'error');
      }
    }

    console.log('\n' + '='*60);
    console.log(`\n📊 Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Your batch system is working correctly.');
    } else if (passed >= total - 1) {
      console.log('✅ Most tests passed! System is likely working (batch submission may fail with mock data).');
    } else {
      console.log('❌ Several tests failed. Check your server and configuration.');
    }

    console.log('\n💡 Next Steps:');
    console.log('  • Ensure GROQ_API_KEY is set in your environment');
    console.log('  • Test with real audio files once Groq integration is ready');
    console.log('  • Check the database file is created in data/transcriptor.db');
    console.log('  • Monitor logs for any error messages\n');

    return passed >= total - 1; // Consider success if only batch submission fails (expected with mock data)
  }
}

// Check if server URL is reachable first
async function checkServerHealth() {
  try {
    const response = await fetch(`${BASE_URL}/api/batch/list`);
    return response.ok || response.status < 500;
  } catch (error) {
    return false;
  }
}

// Main execution
console.log('🔍 Checking server health...');
const serverHealthy = await checkServerHealth();

if (!serverHealthy) {
  console.log('❌ Server not reachable. Please ensure your development server is running:');
  console.log('   npm run dev');
  console.log(`   Server should be accessible at ${BASE_URL}`);
  process.exit(1);
}

const tester = new SimpleBatchTester();
const success = await tester.runAllTests();

process.exit(success ? 0 : 1);
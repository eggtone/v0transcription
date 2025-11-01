import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '@server/lib/logger';

const DB_PATH = path.join(process.cwd(), 'data', 'transcriptor.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Database schema
const initializeSchema = () => {
  logger.info('[Database] Initializing database schema');

  // Batch jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_jobs (
      id TEXT PRIMARY KEY,
      groq_batch_id TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('preparing', 'uploading', 'submitted', 'processing', 'completed', 'failed', 'expired')),
      model TEXT NOT NULL,
      total_items INTEGER NOT NULL DEFAULT 0,
      completed_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME,
      completed_at DATETIME,
      updated_at DATETIME,
      metadata JSON,
      error_message TEXT
    )
  `);

  // Add updated_at column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE batch_jobs ADD COLUMN updated_at DATETIME`);
  } catch (error) {
    // Column already exists, ignore error
  }

  // Batch items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_items (
      id TEXT PRIMARY KEY,
      batch_job_id TEXT NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
      custom_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      result JSON,
      error_message TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      UNIQUE(batch_job_id, custom_id)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_batch_items_batch_job_id ON batch_items(batch_job_id);
    CREATE INDEX IF NOT EXISTS idx_batch_items_status ON batch_items(status);
  `);

  logger.info('[Database] Database schema initialized successfully');
};

// Initialize schema on startup
initializeSchema();

export default db;

// Database helper types
export interface BatchJob {
  id: string;
  groq_batch_id?: string;
  status: 'preparing' | 'uploading' | 'submitted' | 'processing' | 'completed' | 'failed' | 'expired';
  model: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  created_at: string;
  submitted_at?: string;
  completed_at?: string;
  updated_at?: string;
  metadata?: any;
  error_message?: string;
}

export interface BatchItem {
  id: string;
  batch_job_id: string;
  custom_id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// Database operations
export const batchJobQueries = {
  create: db.prepare(`
    INSERT INTO batch_jobs (id, status, model, total_items, metadata)
    VALUES (?, ?, ?, ?, ?)
  `),
  
  findById: db.prepare(`
    SELECT * FROM batch_jobs WHERE id = ?
  `),
  
  findByGroqBatchId: db.prepare(`
    SELECT * FROM batch_jobs WHERE groq_batch_id = ?
  `),
  
  updateStatus: db.prepare(`
    UPDATE batch_jobs 
    SET status = ?, submitted_at = COALESCE(submitted_at, CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP END),
        completed_at = CASE WHEN ? IN ('completed', 'failed', 'expired') THEN CURRENT_TIMESTAMP END,
        updated_at = CURRENT_TIMESTAMP,
        groq_batch_id = COALESCE(?, groq_batch_id),
        error_message = ?
    WHERE id = ?
  `),
  
  updateProgress: db.prepare(`
    UPDATE batch_jobs 
    SET completed_items = ?, failed_items = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  
  listActive: db.prepare(`
    SELECT * FROM batch_jobs 
    WHERE status IN ('preparing', 'uploading', 'submitted', 'processing')
    ORDER BY created_at DESC
  `),
  
  listAll: db.prepare(`
    SELECT * FROM batch_jobs 
    ORDER BY created_at DESC 
    LIMIT ?
  `),
  
  delete: db.prepare(`
    DELETE FROM batch_jobs WHERE id = ?
  `)
};

export const batchItemQueries = {
  create: db.prepare(`
    INSERT INTO batch_items (id, batch_job_id, custom_id, filename, original_filename, file_size, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  
  findByBatchId: db.prepare(`
    SELECT * FROM batch_items WHERE batch_job_id = ? ORDER BY created_at
  `),
  
  updateStatus: db.prepare(`
    UPDATE batch_items 
    SET status = ?, 
        completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP END,
        result = COALESCE(?, result),
        error_message = ?
    WHERE id = ?
  `),
  
  getProgress: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM batch_items 
    WHERE batch_job_id = ?
  `)
};
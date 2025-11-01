"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  RefreshCw, 
  Download, 
  X, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Eye,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  AlertCircle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatTime } from "@/utils/time-utils";

interface BatchJob {
  id: string;
  groq_batch_id?: string;
  status: 'preparing' | 'uploading' | 'submitted' | 'validating' | 'in_progress' | 'finalizing' | 'completed' | 'failed' | 'expired' | 'cancelled' | 'cancelling';
  model: string;
  total_items: number;
  completed_items?: number;
  failed_items?: number;
  created_at: string;
  updated_at?: string;
  completion_window?: string;
  metadata?: {
    submittedAt?: string;
    totalItems?: number;
    processingMode?: string;
  };
}

interface BatchJobProgress {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
  percentage: number;
}

interface BatchJobStatus {
  jobId: string;
  status: string;
  progress: BatchJobProgress;
  estimatedCompletion?: string;
  canCancel: boolean;
}

export function BatchJobManager() {
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, BatchJobStatus>>({});
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load batch jobs on component mount
  useEffect(() => {
    loadBatchJobs();
  }, []);

  // Auto-refresh active jobs every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      const activeJobs = batchJobs.filter(job => 
        ['preparing', 'uploading', 'submitted', 'validating', 'in_progress', 'finalizing', 'cancelling'].includes(job.status)
      );

      if (activeJobs.length > 0) {
        refreshActiveJobs(activeJobs);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [batchJobs, autoRefresh]);

  const refreshActiveJobs = async (jobs: BatchJob[]) => {
    try {
      const statusPromises = jobs.map(job => refreshJobStatus(job.id, false));
      await Promise.allSettled(statusPromises);
    } catch (error) {
      console.error('Error auto-refreshing jobs:', error);
    }
  };

  const loadBatchJobs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/batch/list?limit=20');
      if (response.ok) {
        const data = await response.json();
        setBatchJobs(data.jobs || []);
      } else {
        toast.error('Failed to load batch jobs');
      }
    } catch (error) {
      console.error('Error loading batch jobs:', error);
      toast.error('Error loading batch jobs');
    } finally {
      setLoading(false);
    }
  };

  const refreshAllStatuses = async () => {
    setRefreshing(true);
    try {
      // Refresh status for all non-final jobs (including completed jobs that might have pending items)
      const jobsToCheck = batchJobs.filter(job => 
        !['failed', 'expired', 'cancelled'].includes(job.status)
      );

      const statusPromises = jobsToCheck.map(job => refreshJobStatus(job.id, false));
      await Promise.allSettled(statusPromises);
      
      // Reload the job list to get updated data
      await loadBatchJobs();
      
      toast.success(`Checked status for ${jobsToCheck.length} jobs`);
    } catch (error) {
      console.error('Error checking statuses:', error);
      toast.error('Error checking job statuses');
    } finally {
      setRefreshing(false);
    }
  };

  const refreshJobStatus = async (jobId: string, showToast = true) => {
    try {
      const response = await fetch(`/api/batch/${jobId}/status`);
      if (response.ok) {
        const status = await response.json();
        setStatusMap(prev => ({ ...prev, [jobId]: status }));
        
        // Reload the job list to get updated failed_items count and other changes
        await loadBatchJobs();
        
        if (showToast) {
          toast.success(`Status checked for job ${jobId.slice(0, 8)}... - ${status.status}`);
        }
        return status;
      } else {
        throw new Error(`Status check failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error checking status for job ${jobId}:`, error);
      if (showToast) {
        toast.error(`Failed to check status for job ${jobId.slice(0, 8)}...`);
      }
    }
  };

  const downloadResults = async (jobId: string) => {
    try {
      const response = await fetch(`/api/batch/${jobId}/results?format=zip`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch-results-${jobId.slice(0, 8)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Download started');
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('Error downloading results:', error);
      toast.error('Failed to download results');
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/batch/${jobId}/cancel`, {
        method: 'POST'
      });
      if (response.ok) {
        toast.success(`Cancellation requested for job ${jobId.slice(0, 8)}...`);
        await refreshJobStatus(jobId, false);
        await loadBatchJobs();
      } else {
        throw new Error('Cancellation failed');
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast.error('Failed to cancel job');
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this batch job? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/batch/${jobId}/delete`, {
        method: 'DELETE'
      });
      if (response.ok) {
        toast.success('Batch job deleted');
        await loadBatchJobs();
      } else {
        throw new Error('Deletion failed');
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error('Failed to delete job');
    }
  };

  const retryFailedItems = async (jobId: string) => {
    try {
      // First, get the failed items to show what will be retried
      const failedResponse = await fetch(`/api/batch/${jobId}/failed-items`);
      if (!failedResponse.ok) {
        throw new Error('Failed to fetch failed items');
      }
      
      const failedData = await failedResponse.json();
      const failedItems = failedData.failedItems || [];
      
      if (failedItems.length === 0) {
        toast.info('No failed items found to retry');
        return;
      }

      // Show confirmation dialog
      const confirmed = confirm(
        `Retry ${failedItems.length} failed items from batch job ${jobId.slice(0, 8)}...?\n\n` +
        `Failed files:\n${failedItems.map((item: any) => `• ${item.original_filename}`).join('\n')}\n\n` +
        `This will create a new batch job with the failed items.`
      );
      
      if (!confirmed) {
        return;
      }

      toast.info(`Retrying ${failedItems.length} failed items...`);

      // Submit retry request
      const retryResponse = await fetch(`/api/batch/${jobId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Use same model as original job
          completionWindow: '24h'
        })
      });

      if (!retryResponse.ok) {
        const errorData = await retryResponse.json();
        throw new Error(errorData.error || 'Retry request failed');
      }

      const retryData = await retryResponse.json();
      
      toast.success(
        `Created new batch job ${retryData.newJobId.slice(0, 8)}... with ${retryData.retriedItems} retried items`
      );
      
      // Refresh the job list to show the new job
      await loadBatchJobs();
      
    } catch (error) {
      console.error('Error retrying failed items:', error);
      toast.error(`Failed to retry items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const resubmitJob = async (jobId: string) => {
    try {
      // Get the batch items for this job
      const response = await fetch(`/api/batch/${jobId}/items`);
      if (!response.ok) {
        throw new Error('Failed to fetch batch items');
      }
      
      const data = await response.json();
      const items = data.items || [];
      
      if (items.length === 0) {
        toast.error('No items found for this batch job');
        return;
      }

      // Show file upload dialog with the list of required files
      const fileNames = items.map((item: any) => item.original_filename).join('\n');
      const confirmed = confirm(
        `To resubmit this batch, you need to upload these ${items.length} files again:\n\n${fileNames}\n\nClick OK to continue, then drag & drop these files into the queue.`
      );
      
      if (confirmed) {
        // Navigate user to the main upload area
        toast.info('Please drag & drop the required files into the queue, then click "Submit Batch" again.');
        
        // Optionally, we could store the file list in localStorage for reference
        localStorage.setItem('resubmitFileList', JSON.stringify({
          jobId,
          files: items.map((item: any) => ({
            filename: item.original_filename,
            size: item.file_size
          }))
        }));
      }
    } catch (error) {
      console.error('Error preparing resubmission:', error);
      toast.error('Failed to prepare batch resubmission');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-gray-500" />;
      case 'in_progress':
      case 'finalizing':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'validating':
      case 'preparing':
      case 'uploading':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'in_progress':
      case 'finalizing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'validating':
      case 'preparing':
      case 'uploading':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-orange-100 text-orange-800 border-orange-200';
    }
  };

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${year}${month}${day}:${hours}${minutes}${seconds}`;
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading Batch Jobs...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const getJobStats = () => {
    const stats = {
      total: batchJobs.length,
      active: 0,
      completed: 0,
      failed: 0,
      totalFiles: 0,
      completedFiles: 0
    };

    batchJobs.forEach(job => {
      if (['preparing', 'uploading', 'submitted', 'validating', 'in_progress', 'finalizing', 'cancelling'].includes(job.status)) {
        stats.active++;
      } else if (job.status === 'completed') {
        stats.completed++;
      } else if (['failed', 'expired', 'cancelled'].includes(job.status)) {
        stats.failed++;
      }
      
      stats.totalFiles += job.total_items;
      stats.completedFiles += job.completed_items || 0;
    });

    return stats;
  };

  const stats = getJobStats();

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {batchJobs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Jobs</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.completedFiles}</div>
                <div className="text-sm text-muted-foreground">Files Done</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Batch Job Manager
              </CardTitle>
              <CardDescription>
                Monitor and manage your Groq batch transcription jobs. Use "Check Status" to get latest updates from Groq servers.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  id="auto-refresh"
                />
                <label htmlFor="auto-refresh" className="text-sm font-medium">
                  Auto-check status (30s)
                </label>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={refreshAllStatuses}
                  disabled={refreshing}
                  className="gap-2"
                  title="Check latest status for all active jobs"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Checking Status...' : 'Check All Status'}
                </Button>
                <Button
                  variant="outline"
                  onClick={loadBatchJobs}
                  disabled={loading}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Reload Jobs
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {batchJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No batch jobs found</p>
              <p className="text-sm">Submit a batch job to see it here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {batchJobs.map((job) => {
                const status = statusMap[job.id];
                const isExpanded = expandedJob === job.id;
                
                return (
                  <Card key={job.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          {/* Job Header */}
                          <div className="flex items-center gap-3">
                            {getStatusIcon(job.status)}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                  {job.id.slice(0, 8)}...
                                </code>
                                <Badge className={getStatusColor(job.status)}>
                                  {job.status.replace('_', ' ')}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {job.model} • {job.total_items} files
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Created {formatTimestamp(job.created_at)}
                                {job.updated_at && job.updated_at !== job.created_at && (
                                  <span className="ml-2">
                                    • Status checked {formatTimestamp(job.updated_at)}
                                  </span>
                                )}
                                {job.groq_batch_id && (
                                  <span className="ml-2">
                                    • Groq ID: {job.groq_batch_id.slice(0, 8)}...
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Progress Bar for Active Jobs */}
                          {status && ['in_progress', 'finalizing', 'validating'].includes(job.status) && (
                            <div className="space-y-1">
                              <Progress value={status.progress.percentage} className="h-2" />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>
                                  {status.progress.completed} completed, {status.progress.failed} failed
                                </span>
                                <span>{status.progress.percentage.toFixed(1)}%</span>
                              </div>
                            </div>
                          )}

                          {/* Estimated Completion */}
                          {status?.estimatedCompletion && (
                            <div className="text-sm text-muted-foreground">
                              <Clock className="h-4 w-4 inline mr-1" />
                              Est. completion: {status.estimatedCompletion}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refreshJobStatus(job.id)}
                            className="gap-1"
                            title="Check latest status from Groq"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Check Status
                          </Button>

                          {job.status === 'completed' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadResults(job.id)}
                                className="gap-1"
                              >
                                <Download className="h-3 w-3" />
                                Download
                              </Button>
                            </>
                          )}

                          {status?.canCancel && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancelJob(job.id)}
                              className="gap-1 text-red-600 hover:text-red-700"
                            >
                              <X className="h-3 w-3" />
                              Cancel
                            </Button>
                          )}

                          {job.status === 'completed' && job.failed_items && job.failed_items > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryFailedItems(job.id)}
                              className="gap-1 text-orange-600 hover:text-orange-700"
                              title={`Retry ${job.failed_items} failed items`}
                            >
                              <AlertCircle className="h-3 w-3" />
                              Retry Failed ({job.failed_items})
                            </Button>
                          )}

                          {['failed', 'expired', 'cancelled'].includes(job.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resubmitJob(job.id)}
                              className="gap-1 text-blue-600 hover:text-blue-700"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Resubmit
                            </Button>
                          )}

                          {['completed', 'failed', 'expired', 'cancelled'].includes(job.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteJob(job.id)}
                              className="gap-1 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                            className="gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            {isExpanded ? 'Hide' : 'Details'}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <label className="font-medium text-muted-foreground">Job ID</label>
                              <div className="font-mono text-xs break-all">{job.id}</div>
                            </div>
                            {job.groq_batch_id && (
                              <div>
                                <label className="font-medium text-muted-foreground">Groq Batch ID</label>
                                <div className="font-mono text-xs break-all">{job.groq_batch_id}</div>
                              </div>
                            )}
                            <div>
                              <label className="font-medium text-muted-foreground">Model</label>
                              <div>{job.model}</div>
                            </div>
                            <div>
                              <label className="font-medium text-muted-foreground">Completion Window</label>
                              <div>{job.completion_window || '24h'}</div>
                            </div>
                          </div>

                          {status && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                              <div>
                                <label className="font-medium text-muted-foreground">Total</label>
                                <div className="text-lg font-semibold">{status.progress.total}</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Completed</label>
                                <div className="text-lg font-semibold text-green-600">{status.progress.completed}</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Failed</label>
                                <div className="text-lg font-semibold text-red-600">{status.progress.failed}</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Processing</label>
                                <div className="text-lg font-semibold text-blue-600">{status.progress.processing}</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Pending</label>
                                <div className="text-lg font-semibold text-yellow-600">{status.progress.pending}</div>
                              </div>
                            </div>
                          )}

                          {job.metadata && (
                            <div className="text-sm">
                              <label className="font-medium text-muted-foreground">Metadata</label>
                              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                {JSON.stringify(job.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BatchJobManager;
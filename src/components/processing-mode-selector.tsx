"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, DollarSign, Users } from "lucide-react";

interface ProcessingModeSelectorProps {
  value: 'on-demand' | 'batch';
  onChange: (mode: 'on-demand' | 'batch') => void;
  disabled?: boolean;
}

export function ProcessingModeSelector({ value, onChange, disabled = false }: ProcessingModeSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Processing Mode
        </CardTitle>
        <CardDescription>
          Choose how your audio files will be processed for transcription
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Horizontal Button Toggle */}
        <div className="flex gap-2">
          <Button
            variant={value === 'on-demand' ? 'default' : 'outline'}
            onClick={() => onChange('on-demand')}
            disabled={disabled}
            className="flex-1 h-auto py-3 px-4"
          >
            <div className="text-center">
              <div className="font-medium">On-Demand</div>
              <div className="text-xs opacity-90">Real-time processing</div>
            </div>
          </Button>
          <Button
            variant={value === 'batch' ? 'default' : 'outline'}
            onClick={() => onChange('batch')}
            disabled={disabled}
            className="flex-1 h-auto py-3 px-4"
          >
            <div className="text-center">
              <div className="font-medium">Groq Batch</div>
              <div className="text-xs opacity-90">50% cost savings</div>
            </div>
          </Button>
        </div>

        {/* Mode-specific information */}
        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
          {value === 'on-demand' ? (
            <div className="text-sm">
              <p className="font-medium text-blue-700 mb-1">On-Demand Mode Features:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Process files immediately as they're added</li>
                <li>Real-time progress tracking and status updates</li>
                <li>Interactive audio playback and transcript preview</li>
                <li>Individual file reprocessing and error recovery</li>
              </ul>
            </div>
          ) : (
            <div className="text-sm">
              <p className="font-medium text-green-700 mb-1">Batch Mode Features:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Submit up to 50,000 files in a single batch</li>
                <li>50% cost savings compared to on-demand pricing</li>
                <li>Background processing - close browser safely</li>
                <li>Automatic progress polling and completion notifications</li>
              </ul>
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                <strong>Note:</strong> Files are uploaded to public cloud storage for Groq batch processing. Files are automatically cleaned up after processing.
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProcessingModeSelector;
"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { testYouTubeQualitySettings, formatQualityTestResults } from '@/utils/quality-test';
import { toast } from 'sonner';

export default function QualityTestUI() {
  const [youtubeUrl, setYoutubeUrl] = useState<string>("https://www.youtube.com/watch?v=tH1YfBcGMCo");
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<string>("");

  const handleRunTest = async () => {
    if (!youtubeUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    setIsTesting(true);
    setTestResults("");
    
    try {
      toast.info("Testing YouTube audio quality settings. This may take a while...");
      
      // Run the test with the provided URL
      const results = await testYouTubeQualitySettings(youtubeUrl);
      
      // Format the results as a table
      const formattedResults = formatQualityTestResults(results);
      
      // Set the formatted results
      setTestResults(formattedResults);
      
      // Check if file sizes are actually different
      const successfulResults = results.filter(r => r.success);
      const uniqueSizes = new Set(successfulResults.map(r => r.fileSize));
      
      if (uniqueSizes.size === 1 && successfulResults.length > 1) {
        toast.warning("All quality settings produced the same file size. The quality parameter may not be working correctly.");
      } else if (uniqueSizes.size > 1) {
        toast.success("Test completed successfully. Different quality settings produced different file sizes.");
      }
      
    } catch (error) {
      console.error("Error running quality test:", error);
      toast.error(`Test failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>YouTube Audio Quality Test</CardTitle>
        <CardDescription>
          Test different audio quality settings with a YouTube URL to verify they produce different file sizes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col space-y-2">
          <label htmlFor="youtube-url">YouTube URL to Test</label>
          <div className="flex space-x-2">
            <Input
              id="youtube-url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Enter YouTube URL"
              disabled={isTesting}
              className="flex-1"
            />
            <Button 
              onClick={handleRunTest}
              disabled={isTesting || !youtubeUrl.trim()}
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : "Run Test"}
            </Button>
          </div>
        </div>
        
        {testResults && (
          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Test Results</h3>
            <div className="bg-muted p-4 rounded-md">
              <pre className="whitespace-pre-wrap">{testResults}</pre>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              If the quality parameter is working correctly, different quality settings should produce files with different sizes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 
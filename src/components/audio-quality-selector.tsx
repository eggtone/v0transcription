"use client";

import React from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MP3Quality, MP3QualityLabels, MP3QualityDescriptions, DEFAULT_MP3_QUALITY } from '@/utils/audio-utils';
import { HelpCircle } from 'lucide-react';

interface AudioQualitySelectorProps {
  value: MP3Quality;
  onChange: (value: MP3Quality) => void;
  label?: string;
  className?: string;
  showHelp?: boolean;
}

export default function AudioQualitySelector({
  value = DEFAULT_MP3_QUALITY,
  onChange,
  label = "Audio Quality",
  className = "",
  showHelp = true
}: AudioQualitySelectorProps) {
  // List of quality options to display in the dropdown
  const qualityOptions = [
    MP3Quality.HIGH,
    MP3Quality.KBPS_192,
    MP3Quality.KBPS_128,
    MP3Quality.LOW,
    MP3Quality.KBPS_64,
    MP3Quality.KBPS_32
  ];

  const handleQualityChange = (newValue: string) => {
    onChange(Number(newValue) as MP3Quality);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center space-x-2">
        <Label htmlFor="audio-quality" className="font-medium text-sm">{label}</Label>
        {showHelp && (
          <div className="relative group">
            <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors cursor-help" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none w-64 p-2 bg-popover text-popover-foreground text-xs rounded-md border shadow-md">
              <p className="mb-1 font-medium">Audio Quality Settings</p>
              <p>Higher quality settings provide better audio fidelity but result in larger file sizes.</p> 
              <p>Lower settings are suitable for speech content and have smaller file sizes.</p>
            </div>
          </div>
        )}
      </div>
      <Select 
        value={value.toString()} 
        onValueChange={handleQualityChange}
      >
        <SelectTrigger id="audio-quality" className="w-full focus-visible:ring-1 focus-visible:ring-ring transition-colors">
          <SelectValue placeholder="Select audio quality" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Audio Quality</SelectLabel>
            {qualityOptions.map((quality) => (
              <SelectItem 
                key={quality} 
                value={quality.toString()}
                className="py-2"
              >
                <div className="flex flex-col">
                  <div className="flex items-center">
                    <span className="font-medium">{MP3QualityLabels[quality]}</span>
                    {/* Add color indicators for quality */}
                    {quality >= MP3Quality.KBPS_192 ? (
                      <span className="ml-2 w-3 h-3 rounded-full bg-green-500" title="High quality"></span>
                    ) : quality >= MP3Quality.KBPS_128 ? (
                      <span className="ml-2 w-3 h-3 rounded-full bg-blue-500" title="Medium quality"></span>
                    ) : quality >= MP3Quality.KBPS_64 ? (
                      <span className="ml-2 w-3 h-3 rounded-full bg-yellow-500" title="Standard quality"></span>
                    ) : (
                      <span className="ml-2 w-3 h-3 rounded-full bg-orange-500" title="Low quality"></span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {MP3QualityDescriptions[quality]}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {showHelp && (
        <p className="text-xs text-muted-foreground mt-1 bg-muted/50 p-1.5 rounded">
          Higher quality provides better audio but larger files. Lower quality is good for speech with smaller files.
        </p>
      )}
    </div>
  );
} 
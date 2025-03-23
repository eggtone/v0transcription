// Audio processing worker
// Note: Web Workers don't have direct access to the DOM, AudioContext, or MediaRecorder API

// Use a different approach for MP3 encoding in a worker context
import lamejs from 'lamejs';

interface AudioWorkerMessage {
  command: 'encode';
  audioData: Float32Array[];
  sampleRate: number;
  channels: number;
  quality: number;
  partIndex: number;
}

self.onmessage = function(e: MessageEvent<AudioWorkerMessage>) {
  const { command, audioData, sampleRate, channels, quality, partIndex } = e.data;
  
  if (command === 'encode') {
    try {
      // Define constants for the MPEG mode
      const MPEG_MODE = {
        STEREO: 0,
        JOINT_STEREO: 1,
        DUAL_CHANNEL: 2,
        MONO: 3
      };
      
      // Create MP3 encoder
      const mp3encoder = new lamejs.Mp3Encoder(
        channels > 1 ? MPEG_MODE.JOINT_STEREO : MPEG_MODE.MONO,
        sampleRate,
        128  // Default bitrate, will be overridden by VBR
      );
      
      // Set VBR quality
      if (mp3encoder.setVBR) {
        mp3encoder.setVBR(true);
        mp3encoder.setVBRQuality(quality);
      }
      
      // Process in blocks
      const blockSize = 1152; // LAME sample block size
      const mp3Data: Int8Array[] = [];
      
      const samples = audioData[0].length;
      
      // Process each block
      for (let i = 0; i < samples; i += blockSize) {
        const blockLength = Math.min(blockSize, samples - i);
        
        // Create sample arrays
        const leftSamples = new Int16Array(blockLength);
        const rightSamples = channels > 1 ? new Int16Array(blockLength) : undefined;
        
        // Convert float32 to int16
        for (let j = 0; j < blockLength; j++) {
          if (i + j < samples) {
            // Left channel
            const left = Math.max(-1, Math.min(1, audioData[0][i + j]));
            leftSamples[j] = left < 0 ? Math.floor(left * 32768) : Math.floor(left * 32767);
            
            // Right channel if available
            if (rightSamples && channels > 1) {
              const right = Math.max(-1, Math.min(1, audioData[1][i + j]));
              rightSamples[j] = right < 0 ? Math.floor(right * 32768) : Math.floor(right * 32767);
            }
          } else {
            // Pad with zeroes
            leftSamples[j] = 0;
            if (rightSamples) rightSamples[j] = 0;
          }
        }
        
        // Encode block
        let mp3buf;
        if (channels > 1 && rightSamples) {
          mp3buf = mp3encoder.encodeBuffer(leftSamples, rightSamples);
        } else {
          mp3buf = mp3encoder.encodeBuffer(leftSamples);
        }
        
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
        
        // Report progress (every ~10%)
        if (i % Math.floor(samples / 10) < blockSize) {
          const progress = Math.floor((i / samples) * 100);
          self.postMessage({ 
            type: 'progress', 
            progress,
            partIndex 
          });
        }
      }
      
      // Finalize
      const finalMp3buf = mp3encoder.flush();
      if (finalMp3buf.length > 0) {
        mp3Data.push(finalMp3buf);
      }
      
      // Calculate total length
      const totalLength = mp3Data.reduce((length, data) => length + data.length, 0);
      
      // Create final buffer
      const completeMP3Data = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const data of mp3Data) {
        completeMP3Data.set(data, offset);
        offset += data.length;
      }
      
      // Send the encoded MP3 data back
      self.postMessage({ 
        type: 'complete',
        mp3Data: completeMP3Data.buffer,
        partIndex
      }, [completeMP3Data.buffer]); // Transfer buffer for better performance
      
    } catch (error) {
      self.postMessage({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        partIndex
      });
    }
  }
}; 
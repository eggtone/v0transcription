import AudioTranscription from "@/components/audio-transcription";

export default function Home() {
  return (
    <div className="min-h-screen p-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-8">Audio Transcription Tool</h1>
      <div className="w-full max-w-3xl">
        <AudioTranscription />
      </div>
    </div>
  );
}

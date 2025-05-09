export interface App {
  processId: number;
  processGroupId: number;
  bundleIdentifier: string;
  name: string;
  isRunning: boolean;
}

export interface AppGroup {
  processGroupId: number;
  rootApp: App;
  apps: App[];
}

export interface RecordingStatus {
  processId: number;
  bundleIdentifier: string;
  name: string;
  startTime: number;
  duration: number;
  isGlobal?: boolean;
}

export interface RecordingMetadata {
  appName: string;
  bundleIdentifier: string;
  processId: number;
  recordingStartTime: number;
  recordingEndTime: number;
  recordingDuration: number;
  sampleRate: number;
  channels: number;
  totalSamples: number;
  icon?: Uint8Array;
  mp3: string;
  isGlobal?: boolean;
}

export interface TranscriptionMetadata {
  transcriptionStartTime: number;
  transcriptionEndTime: number;
  transcriptionStatus: 'not_started' | 'pending' | 'completed' | 'error';
  transcription?: {
    title: string;
    segments: Array<{
      speaker: string;
      start_time: string;
      end_time: string;
      transcription: string;
    }>;
    summary: string;
  };
  error?: string;
}

export interface SavedRecording {
  wav: string;
  metadata?: RecordingMetadata;
  transcription?: TranscriptionMetadata;
}

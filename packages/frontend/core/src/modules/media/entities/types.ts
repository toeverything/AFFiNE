export interface TranscriptionResult {
  title: string;
  summary: string;
  segments: {
    speaker: string;
    start: string;
    end: string;
    transcription: string;
  }[];
  actions?: string;
}

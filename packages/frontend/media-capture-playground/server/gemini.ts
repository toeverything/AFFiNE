import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  GoogleAIFileManager,
  type UploadFileResponse,
} from '@google/generative-ai/server';

const DEFAULT_MODEL = 'gemini-2.0-flash';

export interface TranscriptionResult {
  title: string;
  summary: string;
  segments: {
    speaker: string;
    start_time: string;
    end_time: string;
    transcription: string;
  }[];
}

const PROMPT_TRANSCRIPTION = `
Generate audio transcription and diarization for the recording.
The recording source is most likely from a video call with multiple speakers.
Output in JSON format with the following structure:

{
  "segments": [
    {
      "speaker": "Speaker A",
      "start_time": "MM:SS",
      "end_time": "MM:SS",
      "transcription": "..."
    },
    ...
  ],
}
- Use consistent speaker labels throughout
- Accurate timestamps in MM:SS format
- Clean transcription with proper punctuation
- Identify speakers by name if possible, otherwise use "Speaker A/B/C"  
`;

const PROMPT_SUMMARY = `
Generate a short title and summary of the conversation. The input is in the following JSON format:
{
  "segments": [
    {
      "speaker": "Speaker A",
      "start_time": "MM:SS",
      "end_time": "MM:SS",
      "transcription": "..."
    },
    ...
  ],
}

Output in JSON format with the following structure:

{
  "title": "Title of the recording",
  "summary": "Summary of the conversation in markdown format"
}

1. Summary Structure:
- The sumary should be inferred from the speakers' language and context
- All insights should be derived directly from speakers' language and context
- Use hierarchical organization for clear information structure
- Use markdown format for the summary. Use bullet points, lists and other markdown styles when appropriate

2. Title:
- Come up with a title for the recording.
- The title should be a short description of the recording.
- The title should be a single sentence or a few words.
`;

export async function gemini(
  audioFilePath: string,
  options?: {
    model?: 'gemini-2.0-flash' | 'gemini-1.5-flash';
    mode?: 'transcript' | 'summary';
  }
) {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('Missing GOOGLE_GEMINI_API_KEY environment variable');
    throw new Error('GOOGLE_GEMINI_API_KEY is not set');
  }

  // Initialize GoogleGenerativeAI and FileManager with your API_KEY
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  const fileManager = new GoogleAIFileManager(
    process.env.GOOGLE_GEMINI_API_KEY
  );

  async function transcribe(
    audioFilePath: string
  ): Promise<TranscriptionResult | null> {
    let uploadResult: UploadFileResponse | null = null;

    try {
      // Upload the audio file
      uploadResult = await fileManager.uploadFile(audioFilePath, {
        mimeType: 'audio/wav',
        displayName: 'audio_transcription.wav',
      });
      console.log('File uploaded:', uploadResult.file.uri);

      // Initialize a Gemini model appropriate for your use case.
      const model = genAI.getGenerativeModel({
        model: options?.model || DEFAULT_MODEL,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      // Generate content using a prompt and the uploaded file
      const result = await model.generateContent([
        {
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType,
          },
        },
        {
          text: PROMPT_TRANSCRIPTION,
        },
      ]);

      const text = result.response.text();

      try {
        const parsed = JSON.parse(text);
        return parsed;
      } catch (e) {
        console.error('Failed to parse transcription JSON:', e);
        console.error('Raw text that failed to parse:', text);
        return null;
      }
    } catch (e) {
      console.error('Error during transcription:', e);
      return null;
    } finally {
      if (uploadResult) {
        await fileManager.deleteFile(uploadResult.file.name);
      }
    }
  }

  async function summarize(transcription: TranscriptionResult) {
    try {
      const model = genAI.getGenerativeModel({
        model: options?.model || DEFAULT_MODEL,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent([
        {
          text: PROMPT_SUMMARY + '\n\n' + JSON.stringify(transcription),
        },
      ]);

      const text = result.response.text();

      try {
        const parsed = JSON.parse(text);
        return parsed;
      } catch (e) {
        console.error('Failed to parse summary JSON:', e);
        console.error('Raw text that failed to parse:', text);
        return null;
      }
    } catch (e) {
      console.error('Error during summarization:', e);
      return null;
    }
  }

  const transcription = await transcribe(audioFilePath);
  if (!transcription) {
    console.error('Transcription failed');
    return null;
  }

  const summary = await summarize(transcription);
  if (!summary) {
    console.error('Summary generation failed');
    return transcription;
  }

  const result = {
    ...transcription,
    ...summary,
  };
  console.log('Processing completed:', {
    title: result.title,
    segmentsCount: result.segments?.length,
  });

  return result;
}

import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

import { isLink } from '../modules/navigation/utils';

interface AudioEncodingConfig {
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
}

interface AudioEncodingResult {
  encodedChunks: EncodedAudioChunk[];
  config: AudioEncodingConfig;
}

const logger = new DebugLogger('opus-encoding');
const LOCAL_FILE_ASSET_URL = 'assets://local-file';

// Constants
const DEFAULT_BITRATE = 64000;
const MAX_SLICE_DURATION_SECONDS = 10 * 60; // 10 minutes
const MIN_SLICE_DURATION_SECONDS = 5 * 60; // 5 minutes
const AUDIO_LEVEL_THRESHOLD = 0.02; // Threshold for "silence" detection

/**
 * Converts various blob formats to ArrayBuffer
 */
async function blobToArrayBuffer(
  blob: Blob | ArrayBuffer | Uint8Array
): Promise<ArrayBuffer> {
  if (blob instanceof Blob) {
    return await blob.arrayBuffer();
  } else if (blob instanceof Uint8Array) {
    return toArrayBuffer(blob);
  }
  return toArrayBuffer(blob);
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
}

function getRecordingFileUrl(filepath: string): URL {
  const base =
    typeof location !== 'undefined' && location.protocol === 'assets:'
      ? LOCAL_FILE_ASSET_URL
      : typeof location !== 'undefined'
        ? location.origin
        : LOCAL_FILE_ASSET_URL;

  // If filepath already contains a protocol, use it directly
  const fileUrl = isLink(filepath)
    ? new URL(filepath)
    : new URL(filepath, base);

  if (fileUrl.protocol === 'assets:') {
    // Force requests to go through the local-file host so the protocol handler
    // can validate paths correctly.
    fileUrl.hostname = 'local-file';
  }

  return fileUrl;
}

async function readRecordingFileBuffer(filepath: string): Promise<ArrayBuffer> {
  if (apis?.recording?.readRecordingFile) {
    try {
      const buffer = await apis.recording.readRecordingFile(filepath);
      return toArrayBuffer(buffer);
    } catch (error) {
      logger.error('Failed to read recording file via IPC', error);
    }
  }

  const response = await fetch(getRecordingFileUrl(filepath));
  if (!response.ok) {
    throw new Error(
      `Failed to fetch recording file: ${response.status} ${response.statusText}`
    );
  }

  return await response.arrayBuffer();
}

/**
 * Extracts a combined Float32Array from an AudioBuffer
 */
function extractAudioData(
  audioBuffer: AudioBuffer,
  startSample: number = 0,
  endSample?: number
): Float32Array {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleCount =
    endSample !== undefined
      ? endSample - startSample
      : audioBuffer.length - startSample;

  const audioData = new Float32Array(sampleCount * numberOfChannels);

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < sampleCount; i++) {
      audioData[i * numberOfChannels + channel] = channelData[startSample + i];
    }
  }

  return audioData;
}

/**
 * Creates and configures an Opus encoder with the given settings
 */
export function createOpusEncoder(config: AudioEncodingConfig): {
  encoder: AudioEncoder;
  encodedChunks: EncodedAudioChunk[];
} {
  if (typeof AudioEncoder === 'undefined') {
    throw new Error('AudioEncoder is not available in this environment');
  }

  const encodedChunks: EncodedAudioChunk[] = [];
  const encoder = new AudioEncoder({
    output: chunk => {
      encodedChunks.push(chunk);
    },
    error: err => {
      throw new Error(`Encoding error: ${err}`);
    },
  });

  encoder.configure({
    codec: 'opus',
    sampleRate: config.sampleRate,
    numberOfChannels: config.numberOfChannels,
    bitrate: config.bitrate ?? DEFAULT_BITRATE,
  });

  return { encoder, encodedChunks };
}

/**
 * Encodes audio frames using the provided encoder
 */
async function encodeAudioFrames({
  audioData,
  numberOfChannels,
  sampleRate,
  encoder,
}: {
  audioData: Float32Array;
  numberOfChannels: number;
  sampleRate: number;
  encoder: AudioEncoder;
}): Promise<void> {
  const CHUNK_SIZE = numberOfChannels * 1024;
  let offset = 0;

  try {
    for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
      const chunkSize = Math.min(CHUNK_SIZE, audioData.length - i);
      const chunk = audioData.subarray(i, i + chunkSize);

      const frame = new AudioData({
        format: 'f32',
        sampleRate,
        numberOfFrames: chunk.length / numberOfChannels,
        numberOfChannels,
        timestamp: (offset * 1000000) / sampleRate,
        data: chunk,
      });

      encoder.encode(frame);
      frame.close();

      offset += chunk.length / numberOfChannels;
    }
  } finally {
    await encoder.flush();
    encoder.close();
  }
}

/**
 * Creates a mp4 container with the encoded audio chunks
 */
export function muxToMp4(
  encodedChunks: EncodedAudioChunk[],
  config: AudioEncodingConfig
): Uint8Array {
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    audio: {
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: config.numberOfChannels,
    },
    fastStart: 'in-memory',
  });

  for (const chunk of encodedChunks) {
    muxer.addAudioChunk(chunk, {});
  }

  muxer.finalize();
  return new Uint8Array(target.buffer);
}

/**
 * Process and encode audio data to Opus chunks
 */
async function encodeAudioBufferToOpus(
  audioBuffer: AudioBuffer,
  targetBitrate: number = DEFAULT_BITRATE
): Promise<AudioEncodingResult> {
  const config: AudioEncodingConfig = {
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    bitrate: targetBitrate,
  };

  const { encoder, encodedChunks } = createOpusEncoder(config);
  const audioData = extractAudioData(audioBuffer);

  await encodeAudioFrames({
    audioData,
    numberOfChannels: config.numberOfChannels,
    sampleRate: config.sampleRate,
    encoder,
  });

  return { encodedChunks, config };
}

/**
 * Encodes raw audio data to Opus in MP4 container.
 */
export async function encodeRawBufferToOpus({
  filepath,
  sampleRate,
  numberOfChannels,
}: {
  filepath: string;
  sampleRate: number;
  numberOfChannels: number;
}): Promise<Uint8Array> {
  logger.debug('Encoding raw buffer to Opus');

  const { encoder, encodedChunks } = createOpusEncoder({
    sampleRate,
    numberOfChannels,
  });

  const rawBuffer = await readRecordingFileBuffer(filepath);
  const audioData = new Float32Array(rawBuffer);

  await encodeAudioFrames({
    audioData,
    numberOfChannels,
    sampleRate,
    encoder,
  });

  const mp4 = muxToMp4(encodedChunks, { sampleRate, numberOfChannels });
  logger.debug('Encoded raw buffer to Opus');
  return mp4;
}

/**
 * Encodes an audio file Blob to Opus in MP4 container with specified bitrate.
 * @param blob Input audio file blob (supports any browser-decodable format)
 * @param targetBitrate Target bitrate in bits per second (bps)
 * @returns Promise resolving to encoded MP4 data as Uint8Array
 */
export async function encodeAudioBlobToOpus(
  blob: Blob | ArrayBuffer | Uint8Array,
  targetBitrate: number = DEFAULT_BITRATE
): Promise<Uint8Array> {
  const audioContext = new AudioContext();
  logger.debug('Encoding audio blob to Opus');

  try {
    const arrayBuffer = await blobToArrayBuffer(blob);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const { encodedChunks, config } = await encodeAudioBufferToOpus(
      audioBuffer,
      targetBitrate
    );

    const mp4 = muxToMp4(encodedChunks, config);
    logger.debug('Encoded audio blob to Opus');
    return mp4;
  } finally {
    await audioContext.close();
  }
}

/**
 * Finds the best slice point based on audio level
 */
function findSlicePoint(
  audioBuffer: AudioBuffer,
  startSample: number,
  endSample: number,
  minSliceSamples: number
): number {
  // If we have more than min slice duration and not at the end,
  // look for a good splitting point (low audio level)
  if (
    endSample < audioBuffer.length &&
    endSample - startSample > minSliceSamples
  ) {
    // Start checking from min slice duration point
    const checkStartSample = startSample + minSliceSamples;
    const numberOfChannels = audioBuffer.numberOfChannels;

    // Scan forward for a good split point (low audio level)
    for (let i = checkStartSample; i < endSample; i++) {
      // Calculate average level across all channels at this sample
      let level = 0;
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const data = audioBuffer.getChannelData(channel);
        level += Math.abs(data[i]);
      }
      level /= numberOfChannels;

      // If we found a quiet spot, use it as the split point
      if (level < AUDIO_LEVEL_THRESHOLD) {
        return i;
      }
    }
  }

  // If no good splitting point is found, use the original end sample
  return endSample;
}

// Since the audio blob could be long and make the transcribe service busy,
// we need to encode the audio blob to opus slices
// Slice logic:
// 1. Max slice duration is 10 minutes
// 2. Min slice duration is 5 minutes
// 3. If a new slice begins and the duration reached 5 minutes
//    we start a new slice when the audio level value is below the threshold
// 4. If the audio level value is above the threshold, we continue the current slice
export async function encodeAudioBlobToOpusSlices(
  blob: Blob | ArrayBuffer | Uint8Array,
  targetBitrate: number = DEFAULT_BITRATE
): Promise<Uint8Array[]> {
  const audioContext = new AudioContext();

  try {
    const arrayBuffer = await blobToArrayBuffer(blob);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const slices: Uint8Array[] = [];

    // Define slicing parameters
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;

    // Calculate sizes in samples
    const maxSliceSamples = MAX_SLICE_DURATION_SECONDS * sampleRate;
    const minSliceSamples = MIN_SLICE_DURATION_SECONDS * sampleRate;
    const totalSamples = audioBuffer.length;

    // Start slicing
    let startSample = 0;

    while (startSample < totalSamples) {
      // Determine end sample for this slice
      let endSample = Math.min(startSample + maxSliceSamples, totalSamples);

      // Find the best slice point based on audio levels
      endSample = findSlicePoint(
        audioBuffer,
        startSample,
        endSample,
        minSliceSamples
      );

      // Create a slice from startSample to endSample
      const audioData = extractAudioData(audioBuffer, startSample, endSample);

      // Encode this slice to Opus
      const { encoder, encodedChunks } = createOpusEncoder({
        sampleRate,
        numberOfChannels,
        bitrate: targetBitrate,
      });

      await encodeAudioFrames({
        audioData,
        numberOfChannels,
        sampleRate,
        encoder,
      });

      // Mux to MP4 and add to slices
      const mp4 = muxToMp4(encodedChunks, {
        sampleRate,
        numberOfChannels,
        bitrate: targetBitrate,
      });

      slices.push(mp4);

      // Move to next slice
      startSample = endSample;
    }

    logger.debug(`Encoded audio blob to ${slices.length} Opus slices`);
    return slices;
  } finally {
    await audioContext.close();
  }
}

export const createStreamEncoder = (
  recordingId: number,
  codecs: {
    sampleRate: number;
    numberOfChannels: number;
    targetBitrate?: number;
  }
) => {
  const { encoder, encodedChunks } = createOpusEncoder({
    sampleRate: codecs.sampleRate,
    numberOfChannels: codecs.numberOfChannels,
    bitrate: codecs.targetBitrate,
  });

  const toAudioData = (buffer: Uint8Array) => {
    // Each sample in f32 format is 4 bytes
    const BYTES_PER_SAMPLE = 4;
    return new AudioData({
      format: 'f32',
      sampleRate: codecs.sampleRate,
      numberOfChannels: codecs.numberOfChannels,
      numberOfFrames:
        buffer.length / BYTES_PER_SAMPLE / codecs.numberOfChannels,
      timestamp: 0,
      data: buffer,
    });
  };

  let cursor = 0;
  let isClosed = false;

  const next = async () => {
    if (!apis) {
      throw new Error('Electron API is not available');
    }
    if (isClosed) {
      return;
    }
    const { buffer, nextCursor } = await apis.recording.getRawAudioBuffers(
      recordingId,
      cursor
    );
    if (isClosed || cursor === nextCursor) {
      return;
    }
    cursor = nextCursor;
    logger.debug('Encoding next chunk', cursor, nextCursor);
    encoder.encode(toAudioData(buffer));
  };

  const poll = async () => {
    if (isClosed) {
      return;
    }
    logger.debug('Polling next chunk');
    await next();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await poll();
  };

  const close = () => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    return encoder.close();
  };

  return {
    id: recordingId,
    next,
    poll,
    flush: () => {
      return encoder.flush();
    },
    close,
    finish: async () => {
      logger.debug('Finishing encoding');
      await next();
      close();
      const buffer = muxToMp4(encodedChunks, {
        sampleRate: codecs.sampleRate,
        numberOfChannels: codecs.numberOfChannels,
        bitrate: codecs.targetBitrate,
      });
      return buffer;
    },
    [Symbol.dispose]: () => {
      close();
    },
  };
};

export type OpusStreamEncoder = ReturnType<typeof createStreamEncoder>;

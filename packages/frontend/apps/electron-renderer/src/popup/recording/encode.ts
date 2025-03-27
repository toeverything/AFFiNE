import { ArrayBufferTarget, Muxer } from 'webm-muxer';

/**
 * Encodes raw audio data to Opus in WebM container.
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
  // Use streams to process audio data incrementally
  const response = await fetch(new URL(filepath, location.origin));
  if (!response.body) {
    throw new Error('Response body is null');
  }

  // Setup Opus encoder
  const encodedChunks: EncodedAudioChunk[] = [];
  const encoder = new AudioEncoder({
    output: chunk => {
      encodedChunks.push(chunk);
    },
    error: err => {
      throw new Error(`Encoding error: ${err}`);
    },
  });

  // Configure Opus encoder
  encoder.configure({
    codec: 'opus',
    sampleRate: sampleRate,
    numberOfChannels: numberOfChannels,
    bitrate: 128000,
  });

  // Process the stream
  const reader = response.body.getReader();
  let offset = 0;
  const CHUNK_SIZE = numberOfChannels * 1024; // Process 1024 samples per channel at a time

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Convert the chunk to Float32Array
      const float32Data = new Float32Array(value.buffer);

      // Process in smaller chunks to avoid large frames
      for (let i = 0; i < float32Data.length; i += CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, float32Data.length - i);
        const chunk = float32Data.subarray(i, i + chunkSize);

        // Create and encode frame
        const frame = new AudioData({
          format: 'f32',
          sampleRate: sampleRate,
          numberOfFrames: chunk.length / numberOfChannels,
          numberOfChannels: numberOfChannels,
          timestamp: (offset * 1000000) / sampleRate, // timestamp in microseconds
          data: chunk,
        });

        encoder.encode(frame);
        frame.close();

        offset += chunk.length / numberOfChannels;
      }
    }
  } finally {
    await encoder.flush();
    encoder.close();
  }

  // Initialize WebM muxer
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    audio: {
      codec: 'A_OPUS',
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
    },
  });

  // Add all chunks to the muxer
  for (const chunk of encodedChunks) {
    muxer.addAudioChunk(chunk, {});
  }

  // Finalize and get WebM container
  muxer.finalize();
  const { buffer: webmBuffer } = target;

  return new Uint8Array(webmBuffer);
}

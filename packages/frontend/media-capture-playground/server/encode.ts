export function createWavBuffer(
  samples: Float32Array,
  options: {
    sampleRate: number;
    numChannels: number;
  }
) {
  const { sampleRate = 44100, numChannels = 1 } = options;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize); // WAV header is 44 bytes
  const view = new DataView(buffer);

  // Write WAV header
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Sub-chunk size
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true); // Channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // Byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // Block align
  view.setUint16(34, bitsPerSample, true); // Bits per sample

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true); // Sub-chunk size

  // Write audio data
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Convert float32 to int16
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset + i * bytesPerSample,
      s < 0 ? s * 0x8000 : s * 0x7fff,
      true
    );
  }

  return buffer;
}

function writeString(
  view: DataView<ArrayBuffer>,
  offset: number,
  string: string
) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

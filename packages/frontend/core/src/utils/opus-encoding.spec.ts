import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

describe('opus-encoding', () => {
  beforeAll(() => {
    vi.stubGlobal('HTMLElement', class HTMLElement {});
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test('uses m4a metadata for generated transcription slices', async () => {
    const {
      getSliceName: getTranscriptionSliceFileName,
      SLICE_FILE_EXT: TRANSCRIPTION_SLICE_FILE_EXTENSION,
      SLICE_MIME_TYPE: TRANSCRIPTION_SLICE_MIME_TYPE,
    } = await import('./opus-encoding');

    expect(TRANSCRIPTION_SLICE_FILE_EXTENSION).toBe('m4a');
    expect(TRANSCRIPTION_SLICE_MIME_TYPE).toBe('audio/m4a');
    expect(getTranscriptionSliceFileName('meeting', 2)).toBe('meeting-2.m4a');
  });
});

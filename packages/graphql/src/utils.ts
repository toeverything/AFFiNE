export const SPAN_ID_BYTES = 8;
export const TRACE_ID_BYTES = 16;
export const TRACE_VERSION = '00';
export const TRACE_FLAG = '01';

const BytesBuffer = Array(32);

/**
 * inspired by open-telemetry/opentelemetry-js
 */
export function generateRandUTF16Chars(bytes: number) {
  for (let i = 0; i < bytes * 2; i++) {
    BytesBuffer[i] = Math.floor(Math.random() * 16) + 48;
    // valid hex characters in the range 48-57 and 97-102
    if (BytesBuffer[i] >= 58) {
      BytesBuffer[i] += 39;
    }
  }

  return String.fromCharCode(...BytesBuffer.slice(0, bytes * 2));
}

// refers: https://cloud.google.com/trace/docs/reference/v2/rest/v2/projects.traces/batchWrite#:~:text=01%3A23.045123456Z%22.-,endTime,-string%20(Timestamp
export function toZuluDateFormat(date: Date): string {
  const pad = (num: number, shift = 2): string => {
    return ('0'.repeat(shift - 1) + num).slice(-shift);
  };

  date.getUTCMilliseconds();
  return (
    date.getUTCFullYear() +
    '-' +
    pad(date.getUTCMonth() + 1) +
    '-' +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    ':' +
    pad(date.getUTCMinutes()) +
    ':' +
    pad(date.getUTCMilliseconds(), 3) +
    'Z'
  );
}

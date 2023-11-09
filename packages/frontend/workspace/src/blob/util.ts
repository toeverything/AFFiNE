import isSvg from 'is-svg';

// this has a overhead of converting to string for testing if it is svg.
// is there a more performant way?
export function isSvgBuffer(buffer: Uint8Array) {
  const decoder = new TextDecoder('utf-8');
  const str = decoder.decode(buffer);
  return isSvg(str);
}

export function bufferToBlob(buffer: Uint8Array | ArrayBuffer) {
  const isSVG = isSvgBuffer(
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
  );
  // for svg blob, we need to explicitly set the type to image/svg+xml
  return isSVG
    ? new Blob([buffer], { type: 'image/svg+xml' })
    : new Blob([buffer]);
}

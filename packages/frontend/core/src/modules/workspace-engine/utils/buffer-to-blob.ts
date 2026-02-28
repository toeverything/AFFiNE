import isSvg from 'is-svg';

function fastCheckIsNotSvg(buffer: Uint8Array) {
  // check first non-whitespace character is not '<svg' or '<?xml'
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];

    // skip whitespace
    if (
      ch === 0x20 /* \s */ ||
      ch === 0x09 /* \t */ ||
      ch === 0x0b /* \v */ ||
      ch === 0x0c /* \f */ ||
      ch === 0x0a /* \n */ ||
      ch === 0x0d /* \r */ ||
      ch === 0xa0
    ) {
      continue;
    }

    return (
      !(
        buffer[i] === /* '<' */ 0x3c &&
        buffer[i + 1] === /* 's' */ 0x73 &&
        buffer[i + 2] === /* 'v' */ 0x76 &&
        buffer[i + 3] === /* 'g' */ 0x67
      ) &&
      !(
        buffer[i] === /* '<' */ 0x3c &&
        buffer[i + 1] === /* '?' */ 0x3f &&
        buffer[i + 2] === /* 'x' */ 0x78 &&
        buffer[i + 3] === /* 'm' */ 0x6d &&
        buffer[i + 4] === /* 'l' */ 0x6c
      )
    );
  }

  return true;
}

// this has a overhead of converting to string for testing if it is svg.
export function isSvgBuffer(buffer: Uint8Array) {
  if (fastCheckIsNotSvg(buffer)) {
    return false;
  }
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

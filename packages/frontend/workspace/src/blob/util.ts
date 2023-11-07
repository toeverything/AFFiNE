import isSvg from 'is-svg';

// this has a overhead of converting to string for testing if it is svg.
// is there a more performant way?
export function isSvgBuffer(buffer: Uint8Array) {
  const decoder = new TextDecoder('utf-8');
  const str = decoder.decode(buffer);
  return isSvg(str);
}

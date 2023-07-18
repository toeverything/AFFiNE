export function stringToColour(str: string) {
  str = str || 'affine';
  let colour = '#';
  let hash = 0;
  // str to hash
  for (
    let i = 0;
    i < str.length;
    hash = str.charCodeAt(i++) + ((hash << 5) - hash)
  );

  // int/hash to hex
  for (
    let i = 0;
    i < 3;
    colour += ('00' + ((hash >> (i++ * 8)) & 0xff).toString(16)).slice(-2)
  );

  return colour;
}

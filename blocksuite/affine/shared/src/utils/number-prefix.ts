function number2letter(n: number) {
  const ordA = 'a'.charCodeAt(0);
  const ordZ = 'z'.charCodeAt(0);
  const len = ordZ - ordA + 1;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % len) + ordA) + s;
    n = Math.floor(n / len) - 1;
  }
  return s;
}

// Derive from https://gist.github.com/imilu/00f32c61e50b7ca296f91e9d96d8e976
function number2roman(num: number) {
  const lookup: Record<string, number> = {
    M: 1000,
    CM: 900,
    D: 500,
    CD: 400,
    C: 100,
    XC: 90,
    L: 50,
    XL: 40,
    X: 10,
    IX: 9,
    V: 5,
    IV: 4,
    I: 1,
  };
  let romanStr = '';
  for (const [key, value] of Object.entries(lookup)) {
    while (num >= value) {
      romanStr += key;
      num -= value;
    }
  }

  return romanStr;
}

function getPrefix(depth: number, index: number) {
  const map = [
    () => index,
    () => number2letter(index - 1),
    () => number2roman(index),
  ];
  return map[depth % map.length]();
}

export function getNumberPrefix(index: number, depth: number) {
  const prefix = getPrefix(depth, index);
  return `${prefix}.`;
}

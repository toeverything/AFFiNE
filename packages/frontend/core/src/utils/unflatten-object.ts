export function unflattenObject(ob: any) {
  const result: any = {};

  for (const key in ob) {
    if (!Object.prototype.hasOwnProperty.call(ob, key)) continue;

    const keys = key.split('.');
    let current = result;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (i === keys.length - 1) {
        current[k] = ob[key];
      } else {
        current[k] = current[k] || {};
        current = current[k];
      }
    }
  }

  return result;
}

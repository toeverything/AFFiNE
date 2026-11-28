/** Apply translations to text in a fresh copy of a built-in template snapshot. */
export function localizeSnapshot(
  content: unknown,
  translations: Record<string, string>
): unknown {
  const snapshot: unknown = structuredClone(content);
  function visit(node: unknown) {
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'insert' || key === 'title') && typeof value === 'string') {
        if (Object.hasOwn(translations, value)) {
          Object.assign(node, { [key]: translations[value] });
        }
      } else {
        visit(value);
      }
    }
  }
  visit(snapshot);
  return snapshot;
}

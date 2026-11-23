export * from './headers';
export * from './url';

export function parseJson<T>(data: string): T | null {
  try {
    if (data && typeof data === 'object') return data;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

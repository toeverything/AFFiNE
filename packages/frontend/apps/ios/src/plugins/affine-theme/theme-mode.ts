export type NativeThemeMode = 'dark' | 'light' | 'system';

export function normalizeNativeThemeMode(theme?: string): NativeThemeMode {
  switch (theme) {
    case 'dark':
      return 'dark';
    case 'light':
      return 'light';
    default:
      return 'system';
  }
}

import type { NativeThemeMode } from './theme-mode';

export interface AffineThemePlugin {
  onThemeChanged(options: { themeMode: NativeThemeMode }): Promise<void>;
}

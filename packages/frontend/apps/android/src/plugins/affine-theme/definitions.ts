export interface AffineThemePlugin {
  onThemeChanged(options: { darkMode: boolean }): Promise<void>;
}

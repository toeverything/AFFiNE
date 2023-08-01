export interface CodeSignOptions {
  'signing-identity': string;
  identifier?: string;
}

export interface DMGContents {
  x: number;
  y: number;
  type: 'link' | 'file' | 'position';
  path: string;
  name: string;
}

export interface WindowPositionOptions {
  x: number;
  y: number;
}

export interface WindowSizeOptions {
  width: number;
  height: number;
}

export interface WindowOptions {
  position?: WindowPositionOptions;
  size?: WindowSizeOptions;
}

export interface AdditionalDMGOptions {
  'background-color'?: string;
  'icon-size'?: number;
  window?: WindowOptions;
  'code-sign'?: CodeSignOptions;
}

export interface MakerDMGConfig {
  /**
   * The application name
   */
  name?: string;
  /**
   * Path to the background for the DMG window
   */
  background: string;
  /**
   * Path to the icon to use for the app in the DMG window
   */
  icon: string;
  /**
   * Overwrite an existing DMG file if if already exists
   */
  overwrite?: boolean;
  /**
   * Enable debug message output
   */
  debug?: boolean;
  /**
   * How big to make the icon for the app in the DMG
   */
  iconSize?: number;
  /**
   * Disk image format
   *
   * Default: UDZO
   */
  format?: 'UDRW' | 'UDRO' | 'UDCO' | 'UDZO' | 'UDBZ' | 'ULFO';
  file: string;
  /**
   * Additional options to pass through to node-appdmng
   *
   * All available options are available in the [`appdmg` docs](https://github.com/LinusU/node-appdmg)
   */
  additionalDMGOptions?: AdditionalDMGOptions;
}

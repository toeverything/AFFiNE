export interface AIButtonPlugin {
  present(): Promise<void>;
  dismiss(): Promise<void>;
}

export type EditorExtensionName = 'outline' | 'frame' | 'copilot';

export interface EditorExtension {
  name: EditorExtensionName;
  icon: React.ReactNode;
  Component: React.ComponentType;
}

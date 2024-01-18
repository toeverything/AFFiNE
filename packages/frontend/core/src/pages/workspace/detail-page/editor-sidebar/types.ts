export type EditorExtensionName = 'outline' | 'frame' | 'copilot' | 'journal';

export interface EditorExtension {
  name: EditorExtensionName;
  icon: React.ReactNode;
  Component: React.ComponentType;
}

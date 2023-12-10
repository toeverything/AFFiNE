export type EditorExtensionName = 'outline' | 'frame';

export interface EditorExtension {
  name: EditorExtensionName;
  icon: React.ReactNode;
  Component: React.ComponentType;
}

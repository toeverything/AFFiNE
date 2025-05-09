interface Window {
  showOpenFilePicker?: () => Promise<FileSystemFileHandle[]>;
} 
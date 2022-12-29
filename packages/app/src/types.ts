declare global {
  interface Window {
    CLIENT_APP?: boolean;
    showOpenFilePicker?: () => void;
  }
}

export {};

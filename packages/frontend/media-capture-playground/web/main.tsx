import './main.css';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { ipcRenderer } from 'electron'; // ✅ Import for IPC

// ✅ Listen for battery saver status from main process
ipcRenderer.on('battery-saver-status', (_event, isBatterySaver: boolean) => {
  console.log('Battery saver status:', isBatterySaver);
  document.body.classList.toggle('battery-saver-mode', isBatterySaver);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}
createRoot(rootElement).render(<App />);

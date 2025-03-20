import { AppList } from './components/app-list';
import { GlobalRecordButton } from './components/global-record-button';
import { SavedRecordings } from './components/saved-recordings';

export function App() {
  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      <div className="h-full p-4 flex gap-4 max-w-[1800px] mx-auto">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-1">
            <h1 className="text-xl font-bold text-gray-900">
              Running Applications
            </h1>
            <GlobalRecordButton />
          </div>
          <p className="text-sm text-gray-500 mb-2">
            Select an application to start recording its audio, or use global
            recording for system-wide audio
          </p>
          <div className="flex-1 bg-white shadow-lg rounded-lg border border-gray-100 overflow-auto">
            <AppList />
          </div>
        </div>
        <div className="w-[1024px] flex flex-col min-h-0">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Saved Recordings
          </h1>
          <p className="text-sm text-gray-500 mb-2">
            Listen to and manage your recorded audio files
          </p>
          <div className="flex-1 bg-white shadow-lg rounded-lg border border-gray-100 p-4 overflow-auto">
            <SavedRecordings />
          </div>
        </div>
      </div>
    </div>
  );
}

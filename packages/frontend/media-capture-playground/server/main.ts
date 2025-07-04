/* eslint-disable @typescript-eslint/no-misused-promises */
import { createServer } from 'node:http';
import path from 'node:path';

import {
  type ApplicationInfo,
  type AudioCaptureSession,
  ShareableContent,
} from '@affine/native';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs-extra';
import { debounce } from 'lodash-es';
import multer from 'multer';
import { Server } from 'socket.io';

import { createWavBuffer } from './encode';
import { gemini, type TranscriptionResult } from './gemini';

// Constants
const RECORDING_DIR = './recordings';
const PORT = process.env.PORT || 6544;

// Ensure recordings directory exists
fs.ensureDirSync(RECORDING_DIR);
console.log(`📁 Ensuring recordings directory exists at ${RECORDING_DIR}`);

// Types
interface Recording {
  app: ApplicationInfo | null;
  appGroup: ApplicationInfo | null;
  buffers: Float32Array[];
  session: AudioCaptureSession;
  startTime: number;
  isWriting: boolean;
  isGlobal?: boolean;
}

interface RecordingStatus {
  processId: number;
  bundleIdentifier: string;
  name: string;
  startTime: number;
  duration: number;
}

interface RecordingMetadata {
  appName: string;
  bundleIdentifier: string;
  processId: number;
  recordingStartTime: number;
  recordingEndTime: number;
  recordingDuration: number;
  sampleRate: number;
  channels: number;
  totalSamples: number;
  isGlobal?: boolean;
}

interface AppInfo {
  app?: ApplicationInfo;
  processId: number;
  processGroupId: number;
  bundleIdentifier: string;
  name: string;
  isRunning: boolean;
}

interface TranscriptionMetadata {
  transcriptionStartTime: number;
  transcriptionEndTime: number;
  transcriptionStatus: 'not_started' | 'pending' | 'completed' | 'error';
  transcription?: TranscriptionResult;
  error?: string;
}

// State
const recordingMap = new Map<number, Recording>();
let appsSubscriber = () => {};
let fsWatcher: FSWatcher | null = null;

// Server setup
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// Add CORS headers middleware
app.use((req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

app.use(express.json());

// Update the static file serving to handle the new folder structure
app.use(
  '/recordings',
  (req: Request, res: Response, next: NextFunction): void => {
    // Extract the folder name from the path
    const parts = req.path.split('/');
    if (parts.length < 2) {
      res.status(400).json({ error: 'Invalid request path' });
      return;
    }

    const folderName = parts[1];
    if (!validateAndSanitizeFolderName(folderName)) {
      res.status(400).json({ error: 'Invalid folder name format' });
      return;
    }

    if (req.path.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    } else if (req.path.endsWith('.wav')) {
      res.setHeader('Content-Type', 'audio/wav');
    } else if (req.path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    }
    next();
  },
  express.static(RECORDING_DIR)
);

// Configure multer for temporary file storage
const upload = multer({
  dest: RECORDING_DIR,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Helper functions to safely access properties from both ApplicationInfo and ApplicationInfo
function getAppName(app: ApplicationInfo | null): string {
  if (!app) return 'Unknown App';
  return app.name ?? 'Unknown App';
}

function getAppProcessId(app: ApplicationInfo | null): number {
  if (!app) return 0;
  return app.processId ?? 0;
}

function getAppBundleIdentifier(app: ApplicationInfo | null): string {
  if (!app) return 'unknown';
  return app.bundleIdentifier ?? 'unknown';
}

function getAppIcon(app: ApplicationInfo | null): Buffer | null {
  if (!app) return null;
  try {
    return app.icon ?? null;
  } catch {
    return null;
  }
}

// Recording management
async function saveRecording(
  recording: Recording,
  sampleRate: number,
  channels: number
): Promise<string | null> {
  try {
    recording.isWriting = true;
    const app = recording.isGlobal ? null : recording.appGroup || recording.app;

    const totalSamples = recording.buffers.reduce(
      (acc, buf) => acc + buf.length,
      0
    );

    const recordingEndTime = Date.now();
    const recordingDuration = (recordingEndTime - recording.startTime) / 1000;

    const actualSampleRate = sampleRate;
    const channelCount = channels;
    const expectedSamples = recordingDuration * actualSampleRate;

    if (recording.isGlobal) {
      console.log('💾 Saving global recording:');
    } else {
      const appName = getAppName(app);
      const processId = getAppProcessId(app);
      const bundleId = getAppBundleIdentifier(app);
      console.log(`💾 Saving recording for ${appName}:`);
      if (app) {
        console.log(`- Process ID: ${processId}`);
        console.log(`- Bundle ID: ${bundleId}`);
      }
    }

    console.log(`- Actual duration: ${recordingDuration.toFixed(2)}s`);
    console.log(`- Sample rate: ${actualSampleRate}Hz`);
    console.log(`- Channels: ${channelCount}`);
    console.log(`- Expected samples: ${Math.floor(expectedSamples)}`);
    console.log(`- Actual samples: ${totalSamples}`);
    console.log(
      `- Sample ratio: ${(totalSamples / expectedSamples).toFixed(2)}`
    );

    // Create a buffer for the audio
    const buffer = new Float32Array(totalSamples);
    let offset = 0;
    recording.buffers.forEach(buf => {
      buffer.set(buf, offset);
      offset += buf.length;
    });

    await fs.ensureDir(RECORDING_DIR);

    const timestamp = Date.now();
    const baseFilename = recording.isGlobal
      ? `global-recording-${timestamp}`
      : `${getAppBundleIdentifier(app)}-${getAppProcessId(app)}-${timestamp}`;

    // Sanitize the baseFilename to prevent path traversal
    const sanitizedFilename = baseFilename
      .replace(/[/\\:*?"<>|]/g, '') // Remove any filesystem special chars
      .replace(/^\.+|\.+$/g, ''); // Remove leading/trailing dots

    // Use path.join for safe path construction
    const recordingDir = path.join(RECORDING_DIR, sanitizedFilename);
    await fs.ensureDir(recordingDir);

    const wavFilename = path.join(recordingDir, 'recording.wav');
    const transcriptionWavFilename = path.join(
      recordingDir,
      'transcription.wav'
    );
    const metadataFilename = path.join(recordingDir, 'metadata.json');
    const iconFilename = path.join(recordingDir, 'icon.png');

    console.log(`📝 Muxing Wav buffer ${wavFilename}`);
    const wavBuffer = new Uint8Array(
      createWavBuffer(buffer, {
        sampleRate: actualSampleRate,
        numChannels: channelCount,
      })
    );

    // Save Wav file with the actual sample rate from the stream
    console.log(`📝 Writing Wav file to ${wavFilename}`);
    await fs.writeFile(wavFilename, wavBuffer);
    console.log('✅ Wav file written successfully');

    // Save low-quality Wav file for transcription (8kHz)
    console.log(
      `📝 Writing transcription wav file to ${transcriptionWavFilename}`
    );

    await fs.writeFile(transcriptionWavFilename, wavBuffer);
    console.log('✅ Transcription Wav file written successfully');

    // Save app icon if available
    const appIcon = getAppIcon(app);
    if (appIcon) {
      console.log(`📝 Writing app icon to ${iconFilename}`);
      await fs.writeFile(iconFilename, appIcon);
      console.log('✅ App icon written successfully');
    }

    console.log(`📝 Writing metadata to ${metadataFilename}`);
    // Save metadata with the actual sample rate from the stream
    const metadata: RecordingMetadata = {
      appName: getAppName(app),
      bundleIdentifier: getAppBundleIdentifier(app),
      processId: getAppProcessId(app),
      recordingStartTime: recording.startTime,
      recordingEndTime,
      recordingDuration,
      sampleRate: actualSampleRate,
      channels: channelCount,
      totalSamples,
      isGlobal: recording.isGlobal,
    };

    await fs.writeJson(metadataFilename, metadata, { spaces: 2 });
    console.log('✅ Metadata file written successfully');

    return baseFilename;
  } catch (error) {
    console.error('❌ Error saving recording:', error);
    return null;
  }
}

function getRecordingStatus(): RecordingStatus[] {
  return Array.from(recordingMap.entries()).map(([processId, recording]) => ({
    processId,
    bundleIdentifier: getAppBundleIdentifier(recording.app),
    name: getAppName(recording.app),
    startTime: recording.startTime,
    duration: Date.now() - recording.startTime,
  }));
}

function emitRecordingStatus() {
  io.emit('apps:recording', { recordings: getRecordingStatus() });
}

async function startRecording(app: ApplicationInfo) {
  const appProcessId = getAppProcessId(app);
  const appName = getAppName(app);
  const appBundleId = getAppBundleIdentifier(app);

  if (recordingMap.has(appProcessId)) {
    console.log(
      `⚠️ Recording already in progress for ${appName} (PID: ${appProcessId})`
    );
    return;
  }

  try {
    console.log(
      `🎙️ Starting recording for ${appName} (Bundle: ${appBundleId}, PID: ${appProcessId})`
    );

    const processGroupId = app.processGroupId;
    const rootApp =
      ShareableContent.applicationWithProcessId(processGroupId) ||
      ShareableContent.applicationWithProcessId(app.processId);

    if (!rootApp) {
      console.error(`❌ App group not found for ${appName}`);
      return;
    }

    console.log(
      `🎙️ Recording from ${rootApp.name} (PID: ${rootApp.processId})`
    );

    const buffers: Float32Array[] = [];
    const session = ShareableContent.tapAudio(
      appProcessId,
      (err: any, samples: any) => {
        if (err) {
          console.error(`❌ Audio stream error for ${rootApp.name}:`, err);
          return;
        }
        const recording = recordingMap.get(appProcessId);
        if (recording && !recording.isWriting) {
          buffers.push(new Float32Array(samples));
        }
      }
    );

    recordingMap.set(appProcessId, {
      app,
      appGroup: rootApp,
      buffers,
      session,
      startTime: Date.now(),
      isWriting: false,
    });

    console.log(`✅ Recording started successfully for ${rootApp.name}`);
    emitRecordingStatus();
  } catch (error) {
    console.error(`❌ Error starting recording for ${appName}:`, error);
  }
}

async function stopRecording(processId: number) {
  const recording = recordingMap.get(processId);
  if (!recording) {
    console.log(`ℹ️ No active recording found for process ID ${processId}`);
    return;
  }

  const app = recording.appGroup || recording.app;
  const appName = recording.isGlobal
    ? 'Global Recording'
    : getAppName(app) || 'Unknown App';
  const appPid = getAppProcessId(app);

  console.log(`⏹️ Stopping recording for ${appName} (PID: ${appPid})`);
  console.log(
    `⏱️ Recording duration: ${((Date.now() - recording.startTime) / 1000).toFixed(2)}s`
  );

  let sampleRate = 0;
  let channels = 0;
  try {
    // Get properties BEFORE stopping the session
    sampleRate = recording.session.sampleRate;
    channels = recording.session.channels;
  } catch (e) {
    console.error('❌ Failed to get session properties before stopping:', e);
    // Handle error appropriately, maybe use default values or skip saving?
    // For now, log and continue, saveRecording might fail later if values are 0.
  }

  recording.session.stop(); // Stop the session

  // Pass the retrieved values to saveRecording
  const filename = await saveRecording(recording, sampleRate, channels);
  recordingMap.delete(processId);

  if (filename) {
    console.log(`✅ Recording saved successfully to ${filename}`);
  } else {
    console.error(`❌ Failed to save recording for ${appName}`);
  }

  emitRecordingStatus();
  return filename;
}

// File management
async function getRecordings(): Promise<
  {
    wav: string;
    metadata?: RecordingMetadata;
    transcription?: TranscriptionMetadata;
  }[]
> {
  try {
    const allItems = await fs.readdir(RECORDING_DIR);

    // First filter out non-directories
    const dirs = (
      await Promise.all(
        allItems.map(async item => {
          const fullPath = `${RECORDING_DIR}/${item}`;
          try {
            const stat = await fs.stat(fullPath);
            return stat.isDirectory() ? item : null;
          } catch {
            return null;
          }
        })
      )
    ).filter((d): d is string => d !== null);

    const recordings = await Promise.all(
      dirs.map(async dir => {
        try {
          const recordingPath = `${RECORDING_DIR}/${dir}`;
          const metadataPath = `${recordingPath}/metadata.json`;
          const transcriptionPath = `${recordingPath}/transcription.json`;

          let metadata: RecordingMetadata | undefined;
          try {
            metadata = await fs.readJson(metadataPath);
          } catch {
            // Metadata might not exist
          }

          let transcription: TranscriptionMetadata | undefined;
          try {
            // Check if transcription file exists
            const transcriptionExists = await fs.pathExists(transcriptionPath);
            if (transcriptionExists) {
              transcription = await fs.readJson(transcriptionPath);
            } else {
              // If transcription.Wav exists but no transcription.json, it means transcription is available but not started
              transcription = {
                transcriptionStartTime: 0,
                transcriptionEndTime: 0,
                transcriptionStatus: 'not_started',
              };
            }
          } catch (error) {
            console.error(`Error reading transcription for ${dir}:`, error);
          }

          return {
            wav: dir,
            metadata,
            transcription,
          };
        } catch (error) {
          console.error(`Error processing directory ${dir}:`, error);
          return null;
        }
      })
    );

    // Filter out nulls and sort by recording start time
    return recordings
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort(
        (a, b) =>
          (b.metadata?.recordingStartTime ?? 0) -
          (a.metadata?.recordingStartTime ?? 0)
      );
  } catch (error) {
    console.error('Error reading recordings directory:', error);
    return [];
  }
}

async function setupRecordingsWatcher() {
  if (fsWatcher) {
    console.log('🔄 Closing existing recordings watcher');
    await fsWatcher.close();
  }

  try {
    console.log('👀 Setting up recordings watcher...');
    const files = await getRecordings();
    console.log(`📊 Found ${files.length} existing recordings`);
    io.emit('apps:saved', { recordings: files });

    fsWatcher = chokidar.watch(RECORDING_DIR, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    // Handle file events
    fsWatcher
      .on('add', async path => {
        if (path.endsWith('.wav') || path.endsWith('.json')) {
          console.log(`📝 File added: ${path}`);
          const files = await getRecordings();
          io.emit('apps:saved', { recordings: files });
        }
      })
      .on('change', async path => {
        if (path.endsWith('.wav') || path.endsWith('.json')) {
          console.log(`📝 File changed: ${path}`);
          const files = await getRecordings();
          io.emit('apps:saved', { recordings: files });
        }
      })
      .on('unlink', async path => {
        if (path.endsWith('.wav') || path.endsWith('.json')) {
          console.log(`🗑️ File removed: ${path}`);
          const files = await getRecordings();
          io.emit('apps:saved', { recordings: files });
        }
      })
      .on('error', error => {
        console.error('❌ Error watching recordings directory:', error);
      })
      .on('ready', () => {
        console.log('✅ Recordings watcher setup complete');
      });
  } catch (error) {
    console.error('❌ Error setting up recordings watcher:', error);
  }
}

/**
 * Gets all applications and groups them by bundle identifier.
 * For apps with the same bundle ID (e.g., multiple processes of the same app),
 * only one representative is returned. The selection prioritizes:
 * 1. Running apps over stopped apps
 * 2. Lower process IDs (usually parent processes)
 */
async function getAllApps(): Promise<AppInfo[]> {
  const apps: (AppInfo | null)[] = ShareableContent.applications().map(app => {
    try {
      return {
        app,
        processId: app.processId,
        processGroupId: app.processGroupId,
        bundleIdentifier: app.bundleIdentifier,
        name: app.name,
        get isRunning() {
          return ShareableContent.isUsingMicrophone(app.processId);
        },
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  });

  const filteredApps = apps.filter((v): v is AppInfo => {
    return (
      v !== null &&
      (!v.bundleIdentifier.startsWith('com.apple') ||
        v.bundleIdentifier === 'com.apple.Music')
    );
  });

  // Group apps by bundleIdentifier - only keep one representative per bundle ID
  const bundleGroups = new Map<string, AppInfo[]>();

  // Group all apps by their bundle identifier
  for (const app of filteredApps) {
    const bundleId = app.bundleIdentifier;
    if (!bundleGroups.has(bundleId)) {
      bundleGroups.set(bundleId, []);
    }
    bundleGroups.get(bundleId)?.push(app);
  }

  console.log(`📦 Found ${bundleGroups.size} unique bundle identifiers`);

  // For each bundle group, select the best representative
  const groupedApps: AppInfo[] = [];

  for (const [_, appsInGroup] of bundleGroups) {
    if (appsInGroup.length === 1) {
      // Only one app with this bundle ID, use it directly
      groupedApps.push(appsInGroup[0]);
    } else {
      // Multiple apps with same bundle ID, choose the best representative

      // Prefer running apps, then apps with lower process IDs (usually parent processes)
      const sortedApps = appsInGroup.sort((a, b) => {
        // First priority: running apps
        if (a.isRunning !== b.isRunning) {
          return a.isRunning ? -1 : 1;
        }
        // Second priority: lower process ID (usually parent process)
        return a.processId - b.processId;
      });

      const representative = sortedApps[0];
      groupedApps.push(representative);
    }
  }

  // Stop recording if app is not listed (check by process ID)
  await Promise.all(
    Array.from(recordingMap.keys()).map(async processId => {
      if (!groupedApps.some(a => a.processId === processId)) {
        await stopRecording(processId);
      }
    })
  );

  listenToAppStateChanges(groupedApps);

  return groupedApps;
}

function listenToAppStateChanges(apps: AppInfo[]) {
  const subscribers = apps.map(({ app }) => {
    try {
      if (!app) {
        return { unsubscribe: () => {} };
      }

      const appName = getAppName(app);
      const appProcessId = getAppProcessId(app);

      const onAppStateChanged = () => {
        const currentIsRunning =
          ShareableContent.isUsingMicrophone(appProcessId);

        console.log(
          `🔄 Application state changed: ${appName} (PID: ${appProcessId}) is now ${
            currentIsRunning ? '▶️ running' : '⏹️ stopped'
          }`
        );

        // Emit state change to all clients
        io.emit('apps:state-changed', {
          processId: appProcessId,
          isRunning: currentIsRunning,
        });

        if (!currentIsRunning) {
          stopRecording(appProcessId).catch(error => {
            console.error('❌ Error stopping recording:', error);
          });
        }
      };

      return ShareableContent.onAppStateChanged(
        app,
        debounce(onAppStateChanged, 500)
      );
    } catch (error) {
      console.error(
        `Failed to listen to app state changes for ${app ? getAppName(app) : 'unknown app'}:`,
        error
      );
      return { unsubscribe: () => {} };
    }
  });

  appsSubscriber();
  appsSubscriber = () => {
    subscribers.forEach(subscriber => {
      try {
        subscriber.unsubscribe();
      } catch {
        // ignore unsubscribe error
      }
    });
  };
}

// Socket.IO setup
io.on('connection', async socket => {
  console.log('🔌 New client connected');
  const initialApps = await getAllApps();
  console.log(`📤 Sending ${initialApps.length} applications to new client`);
  socket.emit('apps:all', { apps: initialApps });
  socket.emit('apps:recording', { recordings: getRecordingStatus() });

  const files = await getRecordings();
  console.log(`📤 Sending ${files.length} saved recordings to new client`);
  socket.emit('apps:saved', { recordings: files });

  // Set up state listeners for the current apps
  listenToAppStateChanges(initialApps.filter(appInfo => appInfo.app != null));

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});

// Application list change listener
ShareableContent.onApplicationListChanged(() => {
  (async () => {
    try {
      console.log('🔄 Application list changed, updating clients...');
      const apps = await getAllApps();
      console.log(`📢 Broadcasting ${apps.length} applications to all clients`);
      io.emit('apps:all', { apps });

      // Set up state listeners for the updated apps
      listenToAppStateChanges(apps.filter(appInfo => appInfo.app != null));
    } catch (error) {
      console.error('❌ Error handling application list change:', error);
    }
  })().catch(error => {
    console.error('❌ Error in application list change handler:', error);
  });
});

// API Routes
const rateLimiter = rateLimit({
  windowMs: 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
});

app.get('/apps', async (_req, res) => {
  const apps = await getAllApps();
  listenToAppStateChanges(apps);
  res.json({ apps });
});

app.get('/apps/saved', rateLimiter, async (_req, res) => {
  const files = await getRecordings();
  res.json({ recordings: files });
});

// Utility function to validate and sanitize folder name
function validateAndSanitizeFolderName(folderName: string): string | null {
  // Allow alphanumeric characters, hyphens, dots (for bundle IDs)
  // Format: bundleId-processId-timestamp OR global-recording-timestamp
  if (!/^([\w.-]+-\d+-\d+|global-recording-\d+)$/.test(folderName)) {
    return null;
  }

  // Remove any path traversal attempts and disallow any special characters
  const sanitized = folderName
    .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
    .replace(/[/\\:*?"<>|]/g, ''); // Remove any filesystem special chars

  // Double-check the sanitized result still matches our expected pattern
  if (!/^([\w.-]+-\d+-\d+|global-recording-\d+)$/.test(sanitized)) {
    return null;
  }

  return sanitized;
}

app.delete('/recordings/:foldername', rateLimiter, (async (
  req: Request,
  res: Response
): Promise<void> => {
  const foldername = validateAndSanitizeFolderName(req.params.foldername);
  if (!foldername) {
    console.error('❌ Invalid folder name format:', req.params.foldername);
    res.status(400).json({ error: 'Invalid folder name format' });
    return;
  }

  // Construct the path safely using path.join to avoid path traversal
  const recordingDir = path.join(RECORDING_DIR, foldername);

  try {
    // Ensure the resolved path is within RECORDING_DIR
    const resolvedPath = await fs.realpath(recordingDir);
    const recordingDirPath = await fs.realpath(RECORDING_DIR);

    if (!resolvedPath.startsWith(recordingDirPath)) {
      console.error('❌ Path traversal attempt detected:', {
        resolvedPath,
        recordingDirPath,
        requestedFile: foldername,
      });
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    console.log(`🗑️ Deleting recording folder: ${foldername}`);
    await fs.remove(recordingDir);
    console.log('✅ Recording folder deleted successfully');
    res.status(200).json({ success: true });
  } catch (error) {
    const typedError = error as NodeJS.ErrnoException;
    if (typedError.code === 'ENOENT') {
      console.error('❌ Folder not found:', recordingDir);
      res.status(404).json({ error: 'Folder not found' });
    } else {
      console.error('❌ Error deleting folder:', {
        error: typedError,
        code: typedError.code,
        message: typedError.message,
        path: recordingDir,
      });
      res.status(500).json({
        error: `Failed to delete folder: ${typedError.message || 'Unknown error'}`,
      });
    }
  }
}) as RequestHandler);

app.get('/apps/:process_id/icon', (req, res) => {
  const processId = parseInt(req.params.process_id);
  try {
    const app = ShareableContent.applicationWithProcessId(processId);
    if (!app) {
      res.status(404).json({ error: 'App not found' });
      return;
    }
    const icon = app.icon;
    res.set('Content-Type', 'image/png');
    res.send(icon);
  } catch (error) {
    console.error(`Error getting icon for process ${processId}:`, error);
    res.status(404).json({ error: 'App icon not found' });
  }
});

app.post('/apps/:process_id/record', async (req, res) => {
  const processId = parseInt(req.params.process_id);
  try {
    const app = ShareableContent.applicationWithProcessId(processId);
    if (!app) {
      res.status(404).json({ error: 'App not found' });
      return;
    }
    await startRecording(app);
    res.json({ success: true });
  } catch (error) {
    console.error(`Error starting recording for process ${processId}:`, error);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

app.post('/apps/:process_id/stop', async (req, res) => {
  const processId = parseInt(req.params.process_id);
  await stopRecording(processId);
  res.json({ success: true });
});

// Update transcription endpoint to use folder validation
app.post('/recordings/:foldername/transcribe', rateLimiter, (async (
  req: Request,
  res: Response
): Promise<void> => {
  const foldername = validateAndSanitizeFolderName(req.params.foldername);
  if (!foldername) {
    console.error('❌ Invalid folder name format:', req.params.foldername);
    res.status(400).json({ error: 'Invalid folder name format' });
    return;
  }

  const recordingDir = `${RECORDING_DIR}/${foldername}`;

  try {
    // Check if directory exists
    await fs.access(recordingDir);

    const transcriptionWavPath = `${recordingDir}/transcription.wav`;
    const transcriptionMetadataPath = `${recordingDir}/transcription.json`;

    // Check if transcription file exists
    await fs.access(transcriptionWavPath);

    // Create initial transcription metadata
    const initialMetadata: TranscriptionMetadata = {
      transcriptionStartTime: Date.now(),
      transcriptionEndTime: 0,
      transcriptionStatus: 'pending',
    };
    await fs.writeJson(transcriptionMetadataPath, initialMetadata);

    // Notify clients that transcription has started
    io.emit('apps:recording-transcription-start', { filename: foldername });

    const transcription = await gemini(transcriptionWavPath, {
      mode: 'transcript',
    });

    // Update transcription metadata with results
    const metadata: TranscriptionMetadata = {
      transcriptionStartTime: initialMetadata.transcriptionStartTime,
      transcriptionEndTime: Date.now(),
      transcriptionStatus: 'completed',
      transcription: transcription ?? undefined,
    };

    await fs.writeJson(transcriptionMetadataPath, metadata);

    // Notify clients that transcription is complete
    io.emit('apps:recording-transcription-end', {
      filename: foldername,
      success: true,
      transcription,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error during transcription:', error);

    // Update transcription metadata with error
    const metadata: TranscriptionMetadata = {
      transcriptionStartTime: Date.now(),
      transcriptionEndTime: Date.now(),
      transcriptionStatus: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    await fs
      .writeJson(`${recordingDir}/transcription.json`, metadata)
      .catch(err => {
        console.error('❌ Error saving transcription metadata:', err);
      });

    // Notify clients of transcription error
    io.emit('apps:recording-transcription-end', {
      filename: foldername,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}) as RequestHandler);

app.post(
  '/transcribe',
  rateLimiter,
  upload.single('audio') as unknown as RequestHandler,
  (async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
      }

      // Notify clients that transcription has started
      io.emit('apps:recording-transcription-start', { filename: 'temp' });

      const transcription = await gemini(req.file.path, {
        mode: 'transcript',
      });

      res.json({ success: true, transcription });
    } catch (error) {
      console.error('❌ Error during transcription:', error);

      // Notify clients of transcription error
      io.emit('apps:recording-transcription-end', {
        filename: 'temp',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }) as RequestHandler
);

async function startGlobalRecording() {
  const GLOBAL_RECORDING_ID = -1;
  if (recordingMap.has(GLOBAL_RECORDING_ID)) {
    console.log('⚠️ Global recording already in progress');
    return;
  }

  try {
    console.log('🎙️ Starting global recording');

    const buffers: Float32Array[] = [];
    const session = ShareableContent.tapGlobalAudio(
      null,
      (err: Error | null, samples: Float32Array) => {
        if (err) {
          console.error('❌ Global audio stream error:', err);
          return;
        }
        const recording = recordingMap.get(GLOBAL_RECORDING_ID);
        if (recording && !recording.isWriting) {
          buffers.push(new Float32Array(samples));
        }
      }
    );

    recordingMap.set(GLOBAL_RECORDING_ID, {
      app: null,
      appGroup: null,
      buffers,
      session,
      startTime: Date.now(),
      isWriting: false,
      isGlobal: true,
    });

    console.log('✅ Global recording started successfully');
    emitRecordingStatus();
  } catch (error) {
    console.error('❌ Error starting global recording:', error);
  }
}

// Add API endpoint for global recording
app.post('/global/record', async (_req, res) => {
  try {
    await startGlobalRecording();
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error starting global recording:', error);
    res.status(500).json({ error: 'Failed to start global recording' });
  }
});

app.post('/global/stop', async (_req, res) => {
  const GLOBAL_RECORDING_ID = -1;
  await stopRecording(GLOBAL_RECORDING_ID);
  res.json({ success: true });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`
🎙️  Media Capture Server started successfully:
- Port: ${PORT}
- Recordings directory: ${path.join(process.cwd(), RECORDING_DIR)}
`);
});

// Initialize file watcher
setupRecordingsWatcher().catch(error => {
  console.error('Failed to setup recordings watcher:', error);
});

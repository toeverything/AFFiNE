# @affine/media-capture-playground

Full-stack development playground for testing AFFiNE's native audio capture APIs (`@affine/native`). Captures per-application and system-wide audio, saves recordings as WAV files, and transcribes them with Google Gemini. **Not part of the production AFFiNE app** — a local dev tool only.

## Layout

```
web/                        # React frontend (Vite, port 5173 → proxied to 6544)
  main.tsx                  # React entry
  app.tsx                   # 3-pane layout
  types.ts                  # Shared TypeScript interfaces
  utils.ts                  # Socket.IO client + duration formatter
  main.css                  # Tailwind CSS
  index.html
  components/
    app-list.tsx            # List of running apps (grouped by bundle ID)
    app-item.tsx            # App card — record/stop + live duration counter
    global-record-button.tsx# System-wide audio toggle
    saved-recordings.tsx    # Saved recording list (real-time via Socket.IO)
    saved-recording-item.tsx# Player: audio controls, waveform, transcription, summary
    icons.tsx               # SVG icon components
server/                     # Node.js backend (Express + Socket.IO, port 6544)
  main.ts                   # Core server — audio capture, REST API, WebSocket events
  encode.ts                 # Float32Array → WAV file (RIFF header + int16 PCM)
  gemini.ts                 # Google Gemini transcription + summarization
  types.d.ts                # *.txt module declarations
vite.config.ts              # React + Tailwind, /api proxy → localhost:6544
tsconfig.json               # Web TypeScript config
tsconfg.node.json           # Server TypeScript config (note: typo in filename)
```

---

## Running

```bash
# Terminal 1 — backend
yarn dev:server   # Express + Socket.IO on port 6544 (requires GOOGLE_API_KEY env)

# Terminal 2 — frontend
yarn dev:web      # Vite dev server (proxies /api → port 6544)
```

Requires:
- macOS (native audio capture via `@affine/native` uses macOS ScreenCaptureKit)
- `GOOGLE_API_KEY` env var (Gemini API key) for transcription

---

## Architecture

```
React UI (Socket.IO client + SWR subscriptions)
  │
  ├── /api/*  (REST — record, stop, transcribe, delete)
  │
  └── Socket.IO (real-time — app list, recording state, saved recordings)
        │
        Express + Socket.IO server (port 6544)
          ├── @affine/native  →  ShareableContent.tapAudio(processId)
          │                       ShareableContent.tapGlobalAudio()
          ├── Float32 PCM buffer → WAV encoder (encode.ts)
          ├── Chokidar file watcher → broadcasts recordings/ changes
          └── Google Gemini (gemini.ts) → transcription + summary JSON
```

---

## REST API

| Method | Path | Description |
|---|---|---|
| `GET` | `/apps` | List all running capturable apps |
| `POST` | `/apps/:pid/record` | Start recording app by process ID |
| `POST` | `/apps/:pid/stop` | Stop recording app |
| `GET` | `/apps/:pid/icon` | App icon (PNG) |
| `GET` | `/apps/saved` | List saved recording folders |
| `DELETE` | `/recordings/:folder` | Delete a recording folder |
| `POST` | `/recordings/:folder/transcribe` | Trigger Gemini transcription |
| `POST` | `/global/record` | Start system-wide audio capture |
| `POST` | `/global/stop` | Stop system-wide audio capture |
| `POST` | `/transcribe` | Upload a WAV file and transcribe (multipart) |

Process ID `-1` means global system audio.

---

## Socket.IO events

All events are server → client broadcasts.

| Event | Payload | Description |
|---|---|---|
| `apps:all` | `AppInfo[]` | Full list of running apps (re-sent on change) |
| `apps:state-changed` | `{ processId, state }` | App started or stopped |
| `apps:recording` | `{ processId, duration }[]` | Active recordings + elapsed seconds |
| `apps:saved` | `SavedRecording[]` | All saved recordings (re-sent on filesystem change) |
| `apps:recording-transcription-start` | `{ folder }` | Gemini processing started |
| `apps:recording-transcription-end` | `{ folder, error? }` | Gemini done (or failed) |

---

## Recording file structure

Each recording is saved to `recordings/<bundleId>-<processId>-<timestamp>/`:

```
recordings/
  com.apple.Music-1234-1713000000/
    recording.wav          # Full-quality Float32 → int16 PCM WAV
    transcription.wav      # Lower-quality copy for Gemini upload
    metadata.json          # { appName, bundleId, processId, duration, sampleRate, ... }
    transcription.json     # { segments: [{speaker, start, end, text}], title, summary }
    icon.png               # App icon extracted at record time
```

---

## `encode.ts` — WAV encoder

```typescript
// Converts Float32Array samples to a WAV Blob (browser) or Buffer (Node)
function encodeWav(samples: Float32Array, sampleRate: number, channels: number): Buffer

// WAV format: RIFF header + fmt chunk + data chunk
// Sample conversion: float32 [-1, 1] → int16 [-32768, 32767]
```

---

## `gemini.ts` — Transcription & summarization

```typescript
// Upload a WAV file to Gemini File Manager, transcribe with speaker diarization,
// then summarize into a title + markdown summary.
async function transcribeAudio(wavPath: string): Promise<TranscriptionResult>

type TranscriptionResult = {
  segments: Array<{
    speaker: string    // "Speaker 1", "Speaker 2", etc.
    start: string      // "MM:SS"
    end: string        // "MM:SS"
    text: string
  }>
  title: string        // Auto-generated session title
  summary: string      // Markdown summary
}
```

Models used: `gemini-2.5-flash` (transcription), `gemini-2.5-pro` (summary). Files are deleted from Gemini File Manager after processing.

---

## UI layout

```
┌─ Left pane ─────────────────┐  ┌─ Right pane ──────────────────────────────┐
│ [● Record System Audio]     │  │ Saved Recordings                          │
│                             │  │                                           │
│ Active apps (recording):    │  │  ┌─ recording-1 ──────────────────────┐  │
│  ● Spotify ████ 0:32        │  │  │ ▶ ──────●──────────────────── 1:23 │  │
│  ■ Stop                     │  │  │ [Waveform bars]                     │  │
│                             │  │  │ Speaker 1 [00:05]: Hello...         │  │
│ Other apps:                 │  │  │ Speaker 2 [00:12]: Hi there...      │  │
│  ○ Zoom                     │  │  │ [Summary: markdown]                 │  │
│  ○ Chrome                   │  │  │ [Transcribe] [Delete]               │  │
│  ○ Terminal                 │  │  └─────────────────────────────────────┘  │
└─────────────────────────────┘  └───────────────────────────────────────────┘
```

The waveform is rendered as RMS-amplitude bars computed from the WAV audio data. Playback controls include seek, ±10s skip, and variable speed (0.5×–2×).

---

## Dependencies

**Frontend:** React 19, Vite 7, Tailwind CSS 4, SWR 2, Socket.IO Client 4, react-markdown

**Backend:** Express 5, Socket.IO 4, `@affine/native` (audio capture), `@google/generative-ai` (Gemini), multer (file upload), chokidar (file watcher)

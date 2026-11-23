# Cross-Tab Audio State Synchronization

## How Cross-Tab Audio Synchronization Works

1. **Global State**:
   - Shared between all tabs via Electron's global state or browser storage
   - Contains `PlaybackState` and `MediaStats` objects
   - Each state update includes a timestamp (`updateTime`) to track recency

2. **Tab 1 - Playing Audio**:
   - User initiates playback in Tab 1
   - `AudioMediaManagerService` updates global state with new playback info
   - Global state includes the tab ID that initiated playback

3. **Tab 2 - Responding to Changes**:
   - Observes changes to global state via `observeGlobalPlaybackState`
   - Detects that audio is playing in another tab (different tabId)
   - Automatically stops any playing audio in Tab 2
   - Does not attempt to play the audio from Tab 1

4. **State Synchronization**:
   - All state changes include `updateTime` to prevent race conditions
   - `distinctUntilChanged` ensures only meaningful state changes trigger updates
   - `skipUpdate` parameter prevents circular update loops

5. **Exclusive Playback**:
   - `ensureExclusivePlayback` ensures only one audio plays at a time
   - When a tab starts playing, all other tabs stop their playback
   - Global state maintains a single source of truth

This architecture ensures that audio playback is synchronized across tabs, with only one audio playing at any time, while maintaining a consistent user experience.

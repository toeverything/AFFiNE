import {
  createIdentifier,
  LiveData,
  type MediaStats,
  type PlaybackState,
} from '@toeverything/infra';

import type { GlobalState } from '../../storage';

const GLOBAL_MEDIA_PLAYBACK_STATE_KEY = 'media:playback-state';
const GLOBAL_MEDIA_STATS_KEY = 'media:stats';

export const GlobalMediaStateProvider =
  createIdentifier<BaseGlobalMediaStateProvider>('GlobalMediaStateProvider');

/**
 * Base class for media state providers
 */
export abstract class BaseGlobalMediaStateProvider {
  abstract readonly playbackState$: LiveData<PlaybackState | null | undefined>;
  abstract readonly stats$: LiveData<MediaStats | null | undefined>;

  /**
   * Update the playback state
   * @param state Full state object or partial state to update
   */
  abstract updatePlaybackState(state: Partial<PlaybackState> | null): void;

  /**
   * Update the media stats
   * @param stats Full stats object or partial stats to update
   */
  abstract updateStats(stats: Partial<MediaStats> | null): void;
}

/**
 * Provider for global media state in Electron environment
 * This ensures only one media is playing at a time across all tabs
 */
export class ElectronGlobalMediaStateProvider extends BaseGlobalMediaStateProvider {
  constructor(private readonly globalState: GlobalState) {
    super();
  }

  readonly playbackState$ = LiveData.from<PlaybackState | null | undefined>(
    this.globalState.watch(GLOBAL_MEDIA_PLAYBACK_STATE_KEY),
    this.globalState.get(GLOBAL_MEDIA_PLAYBACK_STATE_KEY)
  );
  readonly stats$ = LiveData.from<MediaStats | null | undefined>(
    this.globalState.watch(GLOBAL_MEDIA_STATS_KEY),
    this.globalState.get(GLOBAL_MEDIA_STATS_KEY)
  );

  override updatePlaybackState(state: Partial<PlaybackState> | null): void {
    if (state === null) {
      this.globalState.set(GLOBAL_MEDIA_PLAYBACK_STATE_KEY, null);
      return;
    }

    const currentState = this.playbackState$.value;
    const newState = currentState
      ? { ...currentState, ...state }
      : (state as PlaybackState);

    this.globalState.set(GLOBAL_MEDIA_PLAYBACK_STATE_KEY, newState);
  }

  override updateStats(stats: Partial<MediaStats> | null): void {
    if (stats === null) {
      this.globalState.set(GLOBAL_MEDIA_STATS_KEY, null);
      return;
    }

    const currentStats = this.stats$.value;
    const newStats = currentStats
      ? { ...currentStats, ...stats }
      : (stats as MediaStats);

    this.globalState.set(GLOBAL_MEDIA_STATS_KEY, newStats);
  }
}

/**
 * Provider for global media state in Web environment
 * This is a simplified version that only works within the current tab
 */
export class WebGlobalMediaStateProvider extends BaseGlobalMediaStateProvider {
  readonly playbackState$ = new LiveData<PlaybackState | null | undefined>(
    null
  );
  readonly stats$ = new LiveData<MediaStats | null | undefined>(null);

  /**
   * Update the playback state
   */
  override updatePlaybackState(state: Partial<PlaybackState> | null): void {
    if (state === null) {
      this.playbackState$.setValue(null);
      return;
    }

    const currentState = this.playbackState$.value;
    const newState = currentState
      ? { ...currentState, ...state }
      : (state as PlaybackState);

    this.playbackState$.setValue(newState);
  }

  /**
   * Update the media stats
   */
  override updateStats(stats: Partial<MediaStats> | null): void {
    if (stats === null) {
      this.stats$.setValue(null);
      return;
    }

    const currentStats = this.stats$.value;
    const newStats = currentStats
      ? { ...currentStats, ...stats }
      : (stats as MediaStats);

    this.stats$.setValue(newStats);
  }
}

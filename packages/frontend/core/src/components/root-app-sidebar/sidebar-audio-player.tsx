import { MiniAudioPlayer } from '@affine/component/ui/audio-player';
import { AudioMediaManagerService } from '@affine/core/modules/media';
import type { AudioAttachmentBlock } from '@affine/core/modules/media/entities/audio-attachment-block';
import { AudioAttachmentService } from '@affine/core/modules/media/services/audio-attachment';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { combineLatest, debounceTime, map, of } from 'rxjs';

import { useSeekTime } from '../hooks/use-seek-time';
import * as styles from './sidebar-audio-player.css';

export const SidebarAudioPlayer = () => {
  const audioMediaManagerService = useService(AudioMediaManagerService);
  const audioAttachmentService = useService(AudioAttachmentService);
  const playbackState = useLiveData(audioMediaManagerService.playbackState$);
  const playbackStats = useLiveData(audioMediaManagerService.playbackStats$);

  const [audioAttachmentBlockEntity, setAudioAttachmentBlockEntity] =
    useState<AudioAttachmentBlock | null>(null);

  useEffect(() => {
    if (!playbackStats?.key) {
      return;
    }
    const objRef = audioAttachmentService.get(playbackStats.key);
    if (objRef) {
      setAudioAttachmentBlockEntity(objRef.obj);
      return () => {
        objRef.release();
      };
    }
    return;
  }, [playbackStats, audioAttachmentService]);

  const isSameTab = useMemo(() => {
    if (BUILD_CONFIG.isElectron) {
      return playbackStats?.tabId === audioMediaManagerService.currentTabId;
    }
    return true;
  }, [playbackStats, audioMediaManagerService.currentTabId]);

  const shouldShow = useLiveData(
    useMemo(() => {
      return LiveData.from(
        combineLatest([
          audioAttachmentBlockEntity?.rendering$ ?? of(false),
          audioMediaManagerService.playbackState$,
        ]).pipe(
          map(([v, state]) => {
            if (isSameTab && v) {
              return false;
            }
            if (state?.state === 'stopped') {
              return false;
            }
            return true;
          }),
          debounceTime(50)
        ),
        false
      );
    }, [
      audioAttachmentBlockEntity,
      audioMediaManagerService.playbackState$,
      isSameTab,
    ])
  );

  const seekTime = useSeekTime(playbackState, playbackStats?.duration);

  const handlePlay = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      audioMediaManagerService.play();
    },
    [audioMediaManagerService]
  );

  const handlePause = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      audioMediaManagerService.pause();
    },
    [audioMediaManagerService]
  );

  const handleStop = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      audioMediaManagerService.stop();
    },
    [audioMediaManagerService]
  );

  const handleSeek = useCallback(
    (newTime: number) => {
      audioMediaManagerService.seekTo(newTime);
    },
    [audioMediaManagerService]
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      audioMediaManagerService.setPlaybackRate(rate);
    },
    [audioMediaManagerService]
  );

  const handlePlayerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!playbackStats) {
        return;
      }
      // jump to the audio attachment
      audioMediaManagerService.focusAudioMedia(
        playbackStats.key,
        playbackStats.tabId
      );
    },
    [playbackStats, audioMediaManagerService]
  );

  if (!shouldShow || !playbackState || !playbackStats) {
    return null;
  }

  return (
    <div className={styles.root} onClick={handlePlayerClick}>
      <MiniAudioPlayer
        playbackState={playbackState.state}
        name={playbackStats.name}
        duration={playbackStats.duration}
        seekTime={seekTime}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onSeek={handleSeek}
        playbackRate={playbackState.playbackRate || 1.0}
        onPlaybackRateChange={handlePlaybackRateChange}
        waveform={playbackStats.waveform}
      />
    </div>
  );
};

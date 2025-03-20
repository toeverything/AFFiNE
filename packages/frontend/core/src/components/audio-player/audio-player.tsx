import { IconButton } from '@affine/component';
import { CloseIcon, VoiceIcon } from '@blocksuite/icons/rc';
import bytes from 'bytes';
import { type MouseEventHandler, type ReactNode, useCallback } from 'react';

import * as styles from './audio-player.css';
import { AudioWaveform } from './audio-waveform';
import { AnimatedPlayIcon } from './lottie/animated-play-icon';

// Format seconds to mm:ss
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export interface AudioPlayerProps {
  // Audio metadata
  name: string;
  size: number;
  waveform: number[] | null;
  // Playback state
  playbackState: 'idle' | 'playing' | 'paused' | 'stopped';
  seekTime: number;
  duration: number;
  loading?: boolean;

  notesEntry?: ReactNode;

  onClick?: MouseEventHandler<HTMLDivElement>;

  // Playback controls
  onPlay: MouseEventHandler;
  onPause: MouseEventHandler;
  onStop: MouseEventHandler;
  onSeek: (newTime: number) => void;
}

export const AudioPlayer = ({
  name,
  size,
  playbackState,
  seekTime,
  duration,
  notesEntry,
  waveform,
  loading,
  onPlay,
  onPause,
  onSeek,
  onClick,
}: AudioPlayerProps) => {
  // Handle progress bar click
  const handleProgressClick = useCallback(
    (progress: number) => {
      const newTime = progress * duration;
      onSeek(newTime);
    },
    [duration, onSeek]
  );

  const handlePlayToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (loading) {
        return;
      }
      if (playbackState === 'playing') {
        onPause(e);
      } else {
        onPlay(e);
      }
    },
    [loading, playbackState, onPause, onPlay]
  );

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? seekTime / duration : 0;
  const iconState = loading
    ? 'loading'
    : playbackState === 'playing'
      ? 'pause'
      : 'play';

  return (
    <div className={styles.root} onClick={onClick}>
      <div className={styles.upper}>
        <div className={styles.upperLeft}>
          <div className={styles.upperRow}>
            <VoiceIcon />
            <div className={styles.nameLabel}>{name}</div>
          </div>
          <div className={styles.upperRow}>
            <div className={styles.sizeInfo}>{bytes(size)}</div>
          </div>
        </div>
        <div className={styles.upperRight}>
          {notesEntry}
          <AnimatedPlayIcon
            onClick={handlePlayToggle}
            className={styles.controlButton}
            state={iconState}
          />
        </div>
      </div>
      <div className={styles.progressContainer}>
        <div className={styles.timeDisplay}>{formatTime(seekTime)}</div>
        <AudioWaveform
          waveform={waveform || []}
          progress={progressPercentage}
          onManualSeek={handleProgressClick}
        />
        <div className={styles.timeDisplay}>{formatTime(duration)}</div>
      </div>
    </div>
  );
};

export const MiniAudioPlayer = ({
  name,
  playbackState,
  seekTime,
  duration,
  waveform,
  onPlay,
  onPause,
  onSeek,
  onClick,
  onStop,
}: AudioPlayerProps) => {
  // Handle progress bar click
  const handleProgressClick = useCallback(
    (progress: number) => {
      const newTime = progress * duration;
      onSeek(newTime);
    },
    [duration, onSeek]
  );

  const handlePlayToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (playbackState === 'playing') {
        onPause(e);
      } else {
        onPlay(e);
      }
    },
    [playbackState, onPlay, onPause]
  );

  const handleRewind = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onSeek(seekTime - 15);
    },
    [seekTime, onSeek]
  );

  const handleForward = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onSeek(seekTime + 15);
    },
    [seekTime, onSeek]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onStop(e);
    },
    [onStop]
  );

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? seekTime / duration : 0;
  const iconState =
    playbackState === 'playing'
      ? 'pause'
      : playbackState === 'paused'
        ? 'play'
        : 'loading';

  return (
    <div className={styles.miniRoot} onClick={onClick}>
      <div className={styles.miniNameLabel}>{name}</div>
      <div className={styles.miniPlayerContainer}>
        <div onClick={handleRewind}>-15s</div>
        <AnimatedPlayIcon
          onClick={handlePlayToggle}
          className={styles.controlButton}
          state={iconState}
        />
        <div onClick={handleForward}>+15s</div>
      </div>
      <IconButton
        className={styles.miniCloseButton}
        icon={<CloseIcon />}
        size={16}
        variant="plain"
        onClick={handleClose}
      />
      <div className={styles.miniProgressContainer}>
        <AudioWaveform
          waveform={waveform || []}
          progress={progressPercentage}
          onManualSeek={handleProgressClick}
          mini
        />
      </div>
    </div>
  );
};

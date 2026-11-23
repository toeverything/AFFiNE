import {
  CloseIcon,
  ForwardThirtySecondsIcon,
  RewindFifteenSecondsIcon,
  VoiceIcon,
} from '@blocksuite/icons/rc';
import { clamp } from 'lodash-es';
import { type MouseEventHandler, type ReactNode, useCallback } from 'react';

import { Button, IconButton } from '../button';
import { AnimatedPlayIcon } from '../lottie';
import { Menu, MenuItem } from '../menu';
import * as styles from './audio-player.css';
import { AudioWaveform } from './audio-waveform';

// Format seconds to mm:ss
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export interface AudioPlayerProps {
  // Audio metadata
  name: string;
  description?: ReactNode; // Display file size or error message
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

  // Playback rate
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
}

// Playback rate options
const playbackRates = [0.5, 0.75, 1, 1.5, 1.75, 2, 3];

export const AudioPlayer = ({
  name,
  description,
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
  playbackRate,
  onPlaybackRateChange,
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

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      onPlaybackRateChange(rate);
    },
    [onPlaybackRateChange]
  );

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? seekTime / duration : 0;
  return (
    <div className={styles.root} onClick={onClick}>
      <div className={styles.upper}>
        <div className={styles.upperLeft}>
          <div className={styles.upperRow}>
            <VoiceIcon />
            <div className={styles.nameLabel}>{name}</div>
          </div>
          <div className={styles.upperRow}>
            <div className={styles.description}>{description}</div>
          </div>
        </div>
        <div className={styles.upperRight}>
          <Menu
            rootOptions={{ modal: false }}
            items={
              <>
                {playbackRates.map(rate => (
                  <MenuItem
                    key={rate}
                    selected={rate === playbackRate}
                    onClick={() => handlePlaybackRateChange(rate)}
                  >
                    {rate}x
                  </MenuItem>
                ))}
              </>
            }
          >
            <Button variant="plain" className={styles.playbackRateDisplay}>
              {playbackRate}x
            </Button>
          </Menu>
          {notesEntry}
          <AnimatedPlayIcon
            onClick={handlePlayToggle}
            className={styles.controlButton}
            state={playbackState === 'playing' ? 'pause' : 'play'}
          />
        </div>
      </div>
      <div className={styles.progressContainer}>
        <div className={styles.timeDisplay}>{formatTime(seekTime)}</div>
        <AudioWaveform
          waveform={waveform || []}
          progress={progressPercentage}
          onManualSeek={handleProgressClick}
          loading={!waveform || waveform.length === 0}
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
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onSeek(clamp(seekTime - 15, 0, duration));
    },
    [seekTime, duration, onSeek]
  );

  const handleForward = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onSeek(clamp(seekTime + 30, 0, duration));
    },
    [seekTime, duration, onSeek]
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

  return (
    <div className={styles.miniRoot} onClick={onClick}>
      <div className={styles.miniNameLabel}>{name}</div>
      <div className={styles.miniPlayerContainer}>
        <IconButton
          icon={<RewindFifteenSecondsIcon />}
          size={18}
          variant="plain"
          onClick={handleRewind}
        />
        <AnimatedPlayIcon
          onClick={handlePlayToggle}
          className={styles.controlButton}
          state={playbackState === 'playing' ? 'pause' : 'play'}
        />

        <IconButton
          icon={<ForwardThirtySecondsIcon />}
          size={18}
          variant="plain"
          onClick={handleForward}
        />
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

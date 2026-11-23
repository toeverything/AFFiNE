import type { AudioMediaPlaybackState } from '@affine/core/modules/media/entities/audio-media';
import { clamp } from 'lodash-es';
import { useEffect, useState } from 'react';

const EPSILON = 0.02;

export const useSeekTime = (
  playbackState:
    | {
        state: AudioMediaPlaybackState;
        seekOffset: number;
        updateTime: number;
        playbackRate: number;
      }
    | undefined
    | null,
  duration?: number
) => {
  const [seekTime, setSeekTime] = useState(0);
  useEffect(() => {
    if (!playbackState) {
      return;
    }
    const updateSeekTime = () => {
      if (playbackState) {
        const timeElapsed =
          playbackState.state === 'playing'
            ? ((Date.now() - playbackState.updateTime) / 1000) *
              (playbackState.playbackRate ?? 1.0)
            : 0;
        // if timeElapsed + playbackState.seekOffset is close to duration,
        // set seekTime to duration
        // this is to avoid the seek time being set to a value that is not exactly the same as the duration
        // at the end of the audio
        if (
          duration &&
          Math.abs(timeElapsed + playbackState.seekOffset - duration) < EPSILON
        ) {
          setSeekTime(duration);
        } else {
          setSeekTime(timeElapsed + playbackState.seekOffset);
        }
      }
    };
    updateSeekTime();
    const interval = setInterval(updateSeekTime, 16.67);
    return () => clearInterval(interval);
  }, [duration, playbackState]);

  return clamp(seekTime, 0, duration ?? Number.MAX_SAFE_INTEGER);
};

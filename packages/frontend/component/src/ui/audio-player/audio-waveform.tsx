import { type AffineThemeKeyV2, cssVarV2 } from '@toeverything/theme/v2';
import { clamp } from 'lodash-es';
import { useCallback, useEffect, useRef } from 'react';

import { Skeleton } from '../skeleton';
import * as styles from './audio-waveform.css';

// Helper function to get computed CSS variable value
const getCSSVarValue = (element: HTMLElement, varName: AffineThemeKeyV2) => {
  const style = getComputedStyle(element);
  const varRef = cssVarV2(varName);
  const varKey = varRef.match(/var\((.*?)\)/)?.[1];
  return varKey ? style.getPropertyValue(varKey).trim() : '';
};

interface DrawWaveformOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  waveform: number[];
  progress: number;
  mini: boolean;
}

// to avoid the indicator being cut off at the edges
const horizontalPadding = 2;

const drawWaveform = ({
  canvas,
  container,
  waveform,
  progress,
  mini,
}: DrawWaveformOptions) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, rect.width, rect.height);

  const barWidth = mini ? 0.5 : 1;
  const gap = 1;

  const availableWidth = rect.width - horizontalPadding * 2;
  const totalBars = Math.floor(availableWidth / (barWidth + gap));

  // Resample waveform data to match number of bars
  // We have at least 1000 samples. Totalbars should be less than the total number of samples.
  const step = waveform.length / totalBars;
  const bars = Array.from({ length: totalBars }, (_, i) => {
    const startIdx = Math.floor(i * step);
    const endIdx = Math.floor((i + 1) * step);
    const slice = waveform.slice(startIdx, endIdx);
    return Math.max(slice.reduce((a, b) => a + b, 0) / slice.length, 0.1);
  });

  // Get colors from CSS variables
  const unplayedColor = getCSSVarValue(container, 'text/placeholder');
  const playedColor = getCSSVarValue(
    container,
    'block/recordBlock/timelineIndeicator'
  );
  const progressIndex = Math.floor(progress * bars.length);

  // Draw bars
  bars.forEach((value, i) => {
    const x = horizontalPadding + i * (barWidth + gap);
    const height = value * rect.height;
    const y = (rect.height - height) / 2;

    ctx.fillStyle =
      progress > 0 && i <= progressIndex ? playedColor : unplayedColor;

    // Use roundRect for rounded corners
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, height, barWidth / 2);
      ctx.fill();
    } else {
      // Fallback for browsers that don't support roundRect
      ctx.fillRect(x, y, barWidth, height);
    }
  });

  // Draw progress indicator if progress > 0
  if (progress > 0) {
    const x = horizontalPadding + progress * availableWidth;
    ctx.fillStyle = playedColor;

    // Draw the vertical line
    ctx.fillRect(x - 0.5, 0, 1, rect.height);

    // Draw circles at top and bottom with better positioning
    const dotRadius = 1.5;
    ctx.beginPath();
    // Top dot
    ctx.arc(x, dotRadius, dotRadius, 0, Math.PI * 2);
    // Bottom dot
    ctx.arc(x, rect.height - dotRadius, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
};

// waveform are the amplitude of the audio that sampled at 1000 points
// the value is between 0 and 1
export const AudioWaveform = ({
  waveform,
  progress,
  onManualSeek,
  mini = false, // the bar will be 0.5px instead. by default, the bar is 1px
  loading = false,
}: {
  waveform: number[];
  progress: number;
  onManualSeek: (progress: number) => void;
  mini?: boolean;
  loading?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  // Calculate progress from pointer position
  const calculateProgress = useCallback((clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const availableWidth = rect.width - horizontalPadding * 2;
    return clamp((x - horizontalPadding) / availableWidth, 0, 1);
  }, []);

  // Handle pointer events for seeking
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const newProgress = calculateProgress(e.clientX);
      onManualSeek(newProgress);
      isDraggingRef.current = true;
      e.preventDefault();
    },
    [calculateProgress, onManualSeek]
  );

  const stopPropagation = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
    },
    []
  );

  // Add and remove global event listeners
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const newProgress = calculateProgress(e.clientX);
      onManualSeek(newProgress);
      e.preventDefault();
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [calculateProgress, onManualSeek]);

  // Draw on resize
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      drawWaveform({
        canvas,
        container,
        waveform,
        progress: clamp(progress, 0, 1),
        mini,
      });
    };

    const observer = new ResizeObserver(() => {
      draw();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [mini, progress, waveform]);

  return (
    <div
      ref={containerRef}
      className={styles.root}
      onPointerDown={handlePointerDown}
      onClick={stopPropagation}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress * 100}
      draggable="false"
    >
      {loading ? (
        <Skeleton />
      ) : (
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      )}
    </div>
  );
};

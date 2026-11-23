import clsx from 'clsx';
import type { LottieRef } from 'lottie-react';
import Lottie from 'lottie-react';
import { useEffect, useRef } from 'react';

import * as styles from './styles.css';
import lottieData from './transcribe.json';

export interface AnimatedTranscribeIconProps {
  state: 'idle' | 'transcribing';
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const AnimatedTranscribeIcon = ({
  state,
  className,
  onClick,
}: AnimatedTranscribeIconProps) => {
  const lottieRef: LottieRef = useRef(null);

  useEffect(() => {
    if (!lottieRef.current) return;

    let loopInterval: NodeJS.Timeout | null = null;

    // Cleanup function to clear any existing intervals
    const cleanup = () => {
      const animating = !!loopInterval;
      if (loopInterval) {
        clearInterval(loopInterval);
        loopInterval = null;
      }
      const lottie = lottieRef.current;
      // Play the final segment when stopped
      if (lottie && animating) {
        lottie.goToAndPlay(lottie.animationItem?.currentFrame || 0, true);
      }
    };

    if (state === 'transcribing') {
      // First play the transition to playing state (0-35)
      lottieRef.current.playSegments([0, 35], true);

      // After transition, start the main loop
      const startMainLoop = () => {
        // Play the main animation segment (35-64)
        lottieRef.current?.playSegments([35, 64], true);

        // Set up interval to continue looping
        loopInterval = setInterval(
          () => {
            if (loopInterval) {
              lottieRef.current?.playSegments([35, 64], true);
            }
          },
          (64 - 35) * (1000 / 60)
        ); // 60fps
      };

      // Start the main loop after the transition
      setTimeout(startMainLoop, 10 * (1000 / 60)); // Wait for transition to complete
    } else {
      cleanup();
    }

    // Cleanup on unmount or when state changes
    return cleanup;
  }, [state]);

  return (
    <Lottie
      onClick={onClick}
      lottieRef={lottieRef}
      className={clsx(styles.root, className)}
      animationData={lottieData}
      loop={false} // We're handling the loop manually
      autoplay={false} // We're controlling playback manually
    />
  );
};

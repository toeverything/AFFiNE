import { lottieAtom } from '@affine/jotai';
import { useAtomValue } from 'jotai';
import type { AnimationItem } from 'lottie-web';
import type { FC } from 'react';
import { useEffect, useRef } from 'react';

type CustomLottieProps = {
  options: {
    loop?: boolean | number | undefined;
    autoReverse?: boolean | undefined;
    autoplay?: boolean | undefined;
    animationData: any;
    rendererSettings?: {
      preserveAspectRatio?: string | undefined;
    };
  };
  isStopped?: boolean | undefined;
  speed?: number | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
};

export const InternalLottie: FC<CustomLottieProps> = ({
  options,
  isStopped,
  speed,
  width,
  height,
}) => {
  const element = useRef<HTMLDivElement>(null);
  const lottieInstance = useRef<AnimationItem>();
  const lottie = useAtomValue(lottieAtom);
  const directionRef = useRef<1 | -1>(1);

  useEffect(() => {
    const callback = () => {
      if (!lottieInstance.current) {
        return;
      }
      const frame = lottieInstance.current.currentFrame.toFixed(0);
      if (frame === '1' || frame === '0') {
        directionRef.current = 1;
        lottieInstance.current.setDirection(directionRef.current);
        lottieInstance.current.goToAndStop(0, true);
        lottieInstance.current.play();
      } else {
        directionRef.current = -1;
        lottieInstance.current.setDirection(directionRef.current);
        lottieInstance.current.goToAndStop(
          lottieInstance.current.totalFrames - 1,
          true
        );
        lottieInstance.current.play();
      }
    };
    if (element.current) {
      if (options.autoReverse && options.autoplay) {
        lottieInstance.current = lottie.loadAnimation({
          ...options,
          autoplay: false,
          loop: false,
          container: element.current,
        });
      } else {
        lottieInstance.current = lottie.loadAnimation({
          ...options,
          container: element.current,
        });
      }
      if (options.autoReverse) {
        lottieInstance.current.addEventListener('complete', callback);
      }
    }
    return () => {
      if (options.autoReverse) {
        lottieInstance.current?.removeEventListener('complete', callback);
      }
      lottieInstance.current?.destroy();
    };
  }, [lottie, options]);

  useEffect(() => {
    if (speed) {
      lottieInstance.current?.setSpeed(speed);
    }
    if (isStopped) {
      lottieInstance.current?.stop();
    } else {
      lottieInstance.current?.play();
    }
  }, [isStopped, speed]);

  return <div ref={element} style={{ width, height }}></div>;
};

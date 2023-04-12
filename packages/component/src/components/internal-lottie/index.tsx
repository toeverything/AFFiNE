import { lottieAtom } from '@affine/jotai';
import { useAtomValue } from 'jotai';
import type { FC } from 'react';
import { useEffect, useRef } from 'react';

type CustomLottieProps = {
  options: {
    loop?: boolean | number | undefined;
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
  const lottieInstance = useRef<any>();
  const lottie = useAtomValue(lottieAtom);

  useEffect(() => {
    if (element.current) {
      lottieInstance.current = lottie.loadAnimation({
        ...options,
        container: element.current,
      });
    }
    return () => {
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

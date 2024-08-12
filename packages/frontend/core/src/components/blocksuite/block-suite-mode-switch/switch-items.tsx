import { InternalLottie } from '@affine/component/internal-lottie';
import type { HTMLAttributes } from 'react';
import type React from 'react';
import { cloneElement, useState } from 'react';

import edgelessHover from './animation-data/edgeless-hover.json';
import pageHover from './animation-data/page-hover.json';

type HoverAnimateControllerProps = {
  active?: boolean;
  hide?: boolean;
  trash?: boolean;
  children: React.ReactElement;
} & HTMLAttributes<HTMLDivElement>;

const HoverAnimateController = ({
  children,
  ...props
}: HoverAnimateControllerProps) => {
  const [startAnimate, setStartAnimate] = useState(false);
  return (
    <div
      onMouseEnter={() => setStartAnimate(true)}
      onMouseLeave={() => setStartAnimate(false)}
      {...props}
    >
      {cloneElement(children, {
        isStopped: !startAnimate,
        speed: 1,
        width: 20,
        height: 20,
      })}
    </div>
  );
};

const pageLottieOptions = {
  loop: false,
  autoplay: false,
  animationData: pageHover,
  rendererSettings: {
    preserveAspectRatio: 'xMidYMid slice',
  },
};

const edgelessLottieOptions = {
  loop: false,
  autoplay: false,
  animationData: edgelessHover,
  rendererSettings: {
    preserveAspectRatio: 'xMidYMid slice',
  },
};

export const PageSwitchItem = (
  props: Omit<HoverAnimateControllerProps, 'children'>
) => {
  return (
    <HoverAnimateController {...props}>
      <InternalLottie options={pageLottieOptions} />
    </HoverAnimateController>
  );
};

export const EdgelessSwitchItem = (
  props: Omit<HoverAnimateControllerProps, 'children'>
) => {
  return (
    <HoverAnimateController {...props}>
      <InternalLottie options={edgelessLottieOptions} />
    </HoverAnimateController>
  );
};

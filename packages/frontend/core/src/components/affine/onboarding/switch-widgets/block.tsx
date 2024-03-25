import type { CSSProperties } from 'react';

import type { EdgelessSwitchMode, OnboardingBlockOption } from '../types';
import { onboardingBlock } from './style.css';

interface OnboardingBlockProps extends OnboardingBlockOption {
  mode: EdgelessSwitchMode;
}

export const OnboardingBlock = ({
  bg,
  mode,
  style,
  children,
  offset,
  position,
  fromPosition,
  enterDelay,
  leaveDelay,
  edgelessOnly,
  customStyle,
  sub,
}: OnboardingBlockProps) => {
  const baseStyles = {
    '--bg': bg,
    '--enter-delay': enterDelay ? `${enterDelay}ms` : '0ms',
    '--leave-delay': leaveDelay ? `${leaveDelay}ms` : '0ms',
    zIndex: position ? 1 : 0,
    position: position || fromPosition ? 'absolute' : 'relative',
  } as CSSProperties;

  if (mode === 'page') {
    if (fromPosition) {
      baseStyles.left = fromPosition.x ?? 'unset';
      baseStyles.top = fromPosition.y ?? 'unset';
    }
  } else {
    if (offset) {
      baseStyles.transform = `translate(${offset.x}px, ${offset.y}px)`;
    }
    if (position) {
      baseStyles.left = position.x ?? 'unset';
      baseStyles.top = position.y ?? 'unset';
    }
  }

  const blockStyles = {
    ...baseStyles,
    ...style,
    ...customStyle?.[mode === 'page' ? 'page' : 'edgeless'],
  } as CSSProperties;

  return (
    <div
      style={blockStyles}
      onMouseDown={e => {
        e.stopPropagation();
      }}
      className={onboardingBlock}
      data-mode={mode}
      data-bg-mode={bg && mode !== 'page'}
      data-invisible={mode === 'page' && edgelessOnly}
    >
      {children}
      {sub ? <OnboardingBlock mode={mode} {...sub} /> : null}
    </div>
  );
};

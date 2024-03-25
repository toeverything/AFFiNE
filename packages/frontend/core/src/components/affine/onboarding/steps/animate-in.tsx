import anime from 'animejs';
import { useEffect } from 'react';

import type { PaperProps } from '../curve-paper/paper';
import { Paper } from '../curve-paper/paper';
import * as paperStyles from '../curve-paper/paper.css';
import type { ArticleOption } from '../types';
import * as styles from './animate-in.css';

interface AnimateInProps {
  paperProps?: PaperProps;
  article: ArticleOption;
  onFinished?: () => void;
}

const easing = 'spring(3.2, 100, 10, 0)';
const segments = 6;

const animeSync = (params: Parameters<typeof anime>[0]) => {
  return new Promise(resolve => {
    anime({ ...params, complete: () => resolve(null) });
  });
};

export const AnimateIn = ({
  article,
  paperProps,
  onFinished,
}: AnimateInProps) => {
  const { id: _id, enterOptions, brief } = article;
  const id = `onboardingMoveIn${_id}`;

  const rotateX = (1.2 * enterOptions.curve) / segments;

  useEffect(() => {
    Promise.all([
      animeSync({
        targets: `[data-id="${id}"] .${paperStyles.segment}[data-direction="up"]`,
        rotateX: [-rotateX, 0],
        easing,
        delay: enterOptions.delay,
      }),
      animeSync({
        targets: `[data-id="${id}"] .${paperStyles.segment}[data-direction="down"]`,
        rotateX: [rotateX, 0],
        easing,
        delay: enterOptions.delay,
      }),
    ])
      .then(() => {
        onFinished?.();
      })
      .catch(console.error);
  }, [enterOptions.delay, id, rotateX, onFinished]);

  const props = {
    ...paperProps,
    segments,
    content: brief,
    centerIndex: Math.min(segments - 1, Math.max(0, enterOptions.curveCenter)),
  };

  return (
    <div data-id={id} className={styles.moveIn}>
      <Paper {...props} />
    </div>
  );
};

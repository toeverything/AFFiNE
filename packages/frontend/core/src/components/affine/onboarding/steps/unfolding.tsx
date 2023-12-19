import clsx from 'clsx';
import { useCallback, useRef, useState } from 'react';

import type { ArticleOption } from '../types';
import * as styles from './unfolding.css';

interface UnfoldingProps {
  onChange?: (e: boolean) => void;
  onChanged?: (e: boolean) => void;
  article: ArticleOption;
}

export const Unfolding = ({ article, onChange, onChanged }: UnfoldingProps) => {
  const [fold, setFold] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const toggleFold = useCallback(() => {
    setFold(!fold);
    return !fold;
  }, [fold]);

  const onPaperClick = useCallback(() => {
    const isFold = toggleFold();
    onChange?.(isFold);

    if (ref.current) {
      const handler = () => {
        onChanged?.(isFold);
      };
      ref.current.addEventListener('transitionend', handler, { once: true });
      return () => ref.current?.removeEventListener('transitionend', handler);
    }

    return null;
  }, [toggleFold, onChange, onChanged]);

  return (
    <div
      ref={ref}
      data-fold={fold}
      className={styles.unfoldingWrapper}
      onClick={onPaperClick}
    >
      <div className={clsx(styles.unfoldingContent, !fold && 'leave')}>
        {article.brief}
      </div>
    </div>
  );
};

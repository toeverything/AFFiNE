import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ArticleOption } from '../types';
import * as styles from './unfolding.css';

interface UnfoldingProps {
  fold: boolean;
  article: ArticleOption;
  initialFold?: boolean;
  onChange?: (e: boolean) => void;
  onChanged?: (e: boolean) => void;
}

export const Unfolding = ({
  fold,
  article,
  onChange,
  onChanged,
}: UnfoldingProps) => {
  const [folding, setFolding] = useState(fold);
  const ref = useRef<HTMLDivElement>(null);

  const toggleFold = useCallback(() => {
    onChange?.(!fold);
  }, [fold, onChange]);

  useEffect(() => {
    setFolding(fold);
    const paper = ref.current;

    if (paper) {
      const handler = () => {
        onChanged?.(fold);
      };
      ref.current.addEventListener('transitionend', handler, { once: true });
      return () => paper?.removeEventListener('transitionend', handler);
    }

    return () => null;
  }, [fold, onChanged]);

  return (
    <div
      ref={ref}
      data-fold={folding}
      className={styles.unfoldingWrapper}
      onClick={toggleFold}
    >
      <div className={clsx(styles.unfoldingContent, !folding && 'leave')}>
        {article.brief}
      </div>
    </div>
  );
};

import { useCallback } from 'react';

import { AnimateIn } from './steps/animate-in';
import type { ArticleOption } from './types';

interface PaperStepsProps {
  show?: boolean;
  article: ArticleOption;
}

export const PaperSteps = ({ show, article }: PaperStepsProps) => {
  const onFinished = useCallback(() => {
    console.log('onFinished');
  }, []);

  if (!show) return null;
  return <AnimateIn article={article} onFinished={onFinished} />;
};

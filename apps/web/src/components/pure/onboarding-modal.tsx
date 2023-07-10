import { TourModal } from '@affine/component/tour-modal';
import { useAtom } from 'jotai';
import type { FC } from 'react';
import { useCallback } from 'react';

import { openOnboardingModalAtom } from '../../atoms';
import { guideOnboardingAtom } from '../../atoms/guide';

export const OnboardingModal: FC = () => {
  const [open, setOpen] = useAtom(openOnboardingModalAtom);
  const [guideOpen, setShowOnboarding] = useAtom(guideOnboardingAtom);
  const onCloseTourModal = useCallback(() => {
    setShowOnboarding(false);
    setOpen(false);
  }, [setShowOnboarding]);

  return (
    <TourModal open={!open ? guideOpen : open} onClose={onCloseTourModal} />
  );
};

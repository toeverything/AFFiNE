import { TourModal } from '@affine/component/tour-modal';
import { useAtom, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import { openOnboardingModalAtom } from '../../atoms';
import { guideOnboardingAtom } from '../../atoms/guide';

type OnboardingModalProps = {
  onClose: () => void;
  open: boolean;
};

const getHelperGuide = (): { onBoarding: boolean } | null => {
  const helperGuide = localStorage.getItem('helper-guide');
  if (helperGuide) {
    return JSON.parse(helperGuide);
  }
  return null;
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  open,
  onClose,
}) => {
  const setShowOnboarding = useSetAtom(guideOnboardingAtom);
  const [openOnboarding, setOpenOnboarding] = useAtom(openOnboardingModalAtom);
  const onCloseTourModal = useCallback(() => {
    setShowOnboarding(false);
    onClose();
  }, [onClose, setShowOnboarding]);

  const shouldShow = useMemo(() => {
    const helperGuide = getHelperGuide();
    return helperGuide?.onBoarding ?? true;
  }, []);

  if (shouldShow && shouldShow !== openOnboarding) {
    setOpenOnboarding(true);
  }
  return <TourModal open={open} onClose={onCloseTourModal} />;
};

export default OnboardingModal;

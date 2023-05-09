import { TourModal } from '@affine/component/tour-modal';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo } from 'react';

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
  const [, setShowOnboarding] = useAtom(guideOnboardingAtom);
  const [, setOpenOnboarding] = useAtom(openOnboardingModalAtom);
  const onCloseTourModal = useCallback(() => {
    setShowOnboarding(false);
    onClose();
  }, [onClose, setShowOnboarding]);

  const shouldShow = useMemo(() => {
    const helperGuide = getHelperGuide();
    return helperGuide?.onBoarding ?? true;
  }, []);

  useEffect(() => {
    if (shouldShow) {
      setOpenOnboarding(true);
    }
  }, [shouldShow, setOpenOnboarding]);
  return <TourModal open={open} onClose={onCloseTourModal} />;
};

export default OnboardingModal;

import ChangeLogComponent from '@affine/component/changeLog';
import { useCallback } from 'react';

import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
} from '../../../../hooks/use-is-first-load';

export const ChangeLog = () => {
  const [guideHidden, setGuideHidden] = useGuideHidden();
  const [guideHiddenUntilNextUpdate, setGuideHiddenUntilNextUpdate] =
    useGuideHiddenUntilNextUpdate();
  const onCloseWhatsNew = useCallback(() => {
    setTimeout(() => {
      setGuideHiddenUntilNextUpdate({
        ...guideHiddenUntilNextUpdate,
        changeLog: true,
      });
      setGuideHidden({ ...guideHidden, changeLog: true });
    }, 300);
  }, [
    guideHidden,
    guideHiddenUntilNextUpdate,
    setGuideHidden,
    setGuideHiddenUntilNextUpdate,
  ]);
  if (guideHiddenUntilNextUpdate.changeLog) {
    return <></>;
  }
  return <ChangeLogComponent onCloseWhatsNew={onCloseWhatsNew} />;
};

export default ChangeLog;

import ChangeLogComponent from '@affine/component/changeLog';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { guideChangeLogAtom } from '../../../../atoms/guide';

export const ChangeLog = () => {
  const [showChangeLogTips, setShowChangeLogTips] = useAtom(guideChangeLogAtom);
  const onCloseWhatsNew = useCallback(() => {
    setShowChangeLogTips(false);
  }, [setShowChangeLogTips]);
  if (!showChangeLogTips) {
    return <></>;
  }
  return <ChangeLogComponent onCloseWhatsNew={onCloseWhatsNew} />;
};

export default ChangeLog;

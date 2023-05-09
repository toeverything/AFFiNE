import { DownloadTips } from '@affine/component/affine-banner';
import { getEnvironment } from '@affine/env';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { guideDownloadClientTipAtom } from '../../../atoms/guide';

export const DownloadClientTip = () => {
  const env = getEnvironment();
  const [showDownloadClientTips, setShowDownloadClientTips] = useAtom(
    guideDownloadClientTipAtom
  );
  const onCloseDownloadClient = useCallback(() => {
    setShowDownloadClientTips(false);
  }, [setShowDownloadClientTips]);

  if (!showDownloadClientTips || env.isDesktop) {
    return <></>;
  }
  return <DownloadTips onClose={onCloseDownloadClient} />;
};
export default DownloadClientTip;

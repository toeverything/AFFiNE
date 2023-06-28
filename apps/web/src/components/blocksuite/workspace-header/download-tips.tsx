import { DownloadTips } from '@affine/component/affine-banner';
import { isDesktop } from '@affine/env/constant';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { guideDownloadClientTipAtom } from '../../../atoms/guide';

export const DownloadClientTip = () => {
  const [showDownloadClientTips, setShowDownloadClientTips] = useAtom(
    guideDownloadClientTipAtom
  );
  const onCloseDownloadClient = useCallback(() => {
    setShowDownloadClientTips(false);
  }, [setShowDownloadClientTips]);

  if (!showDownloadClientTips || isDesktop) {
    return <></>;
  }
  return <DownloadTips onClose={onCloseDownloadClient} />;
};
export default DownloadClientTip;

import { DownloadTips } from '@affine/component/affine-banner';
import { isDesktop } from '@affine/env/constant';

export const DownloadClientTip = ({
  show,
  onClose,
}: {
  // const [showDownloadClientTips, setShowDownloadClientTips] = useAtom(
  //   guideDownloadClientTipAtom
  // );
  // const onCloseDownloadClient = useCallback(() => {
  //   setShowDownloadClientTips(false);
  // }, [setShowDownloadClientTips]);

  // if (!showDownloadClientTips || isDesktop) {
  //   return <></>;
  // }

  show: boolean;
  onClose: () => void;
}) => {
  if (!show || isDesktop) {
    return null;
  }
  return <DownloadTips onClose={onClose} />;
};
export default DownloadClientTip;

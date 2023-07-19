import { DownloadTips } from '@affine/component/affine-banner';

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
  if (!show || environment.isDesktop) {
    return null;
  }
  return <DownloadTips onClose={onClose} />;
};
export default DownloadClientTip;

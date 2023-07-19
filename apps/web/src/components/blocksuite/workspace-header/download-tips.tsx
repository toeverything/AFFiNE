import { DownloadTips } from '@affine/component/affine-banner';

export const DownloadClientTip = ({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) => {
  if (!show || environment.isDesktop) {
    return null;
  }
  return <DownloadTips onClose={onClose} />;
};
export default DownloadClientTip;

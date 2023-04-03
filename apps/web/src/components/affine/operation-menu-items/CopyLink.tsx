import { MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { CopyIcon } from '@blocksuite/icons';

import type { CommonMenuItemProps } from './types';
// import { useRouter } from "next/router";
// import { useCallback } from "react";
//
// import { toast } from "../../../utils";

export const CopyLink = ({ onItemClick, onSelect }: CommonMenuItemProps) => {
  const { t } = useTranslation();
  // const router = useRouter();
  // const copyUrl = useCallback(() => {
  //   const workspaceId = router.query.workspaceId;
  //   navigator.clipboard.writeText(window.location.href);
  //   toast(t("Copied link to clipboard"));
  // }, [router.query.workspaceId, t]);
  return (
    <>
      <MenuItem
        onClick={() => {
          onItemClick?.();
          onSelect?.();
        }}
        icon={<CopyIcon />}
        disabled={true}
      >
        {t('Copy Link')}
      </MenuItem>
    </>
  );
};

import { Empty } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import React from 'react';
export const PageListEmpty = (props: { listType?: string }) => {
  const { listType } = props;
  const { t } = useTranslation();

  const getEmptyDescription = () => {
    if (listType === 'all') {
      return t('emptyAllPages');
    }
    if (listType === 'favorite') {
      return t('emptyFavorite');
    }
    if (listType === 'trash') {
      return t('emptyTrash');
    }
  };

  return (
    <div style={{ height: 'calc(100% - 52px)' }}>
      <Empty description={getEmptyDescription()} />
    </div>
  );
};

export default PageListEmpty;

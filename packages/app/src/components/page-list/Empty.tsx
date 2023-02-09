import React from 'react';
import { Empty } from '@affine/component';
import { useTranslation } from '@affine/i18n';
export const PageListEmpty = (props: { listType?: string }) => {
  const { listType } = props;
  const { t } = useTranslation();
  return (
    <div style={{ textAlign: 'center' }}>
      <Empty
        width={800}
        height={300}
        sx={{ marginTop: '100px', marginBottom: '30px' }}
      />
      {listType === 'all' && <p>{t('emptyAllPages')}</p>}
      {listType === 'favorite' && <p>{t('emptyFavourite')}</p>}
      {listType === 'trash' && <p>{t('emptyTrash')}</p>}
    </div>
  );
};

export default PageListEmpty;

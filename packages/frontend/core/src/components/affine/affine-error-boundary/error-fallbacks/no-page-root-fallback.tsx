import { NoPageRootError } from '@affine/core/components/blocksuite/block-suite-editor';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import { ContactUS, ErrorDetail } from '../error-basic/error-detail';
import { createErrorFallback } from '../error-basic/fallback-creator';

export const NoPageRootFallback = createErrorFallback(
  NoPageRootError,
  props => {
    const { resetError } = props;
    const t = useAFFiNEI18N();

    return (
      <ErrorDetail
        title={t['com.affine.error.no-page-root.title']()}
        description={<ContactUS />}
        resetError={resetError}
      />
    );
  }
);

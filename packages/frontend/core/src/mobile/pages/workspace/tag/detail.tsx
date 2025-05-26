import { useThemeColorV2 } from '@affine/component';
import { PageNotFound } from '@affine/core/desktop/pages/404';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { TagService } from '@affine/core/modules/tag';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { TagDetail } from '../../../views';

export const Component = () => {
  useThemeColorV2('layer/background/mobile/primary');
  const params = useParams();
  const tagId = params.tagId;

  const globalContext = useService(GlobalContextService).globalContext;

  const tagList = useService(TagService).tagList;
  const currentTag = useLiveData(tagList.tagByTagId$(tagId));

  useEffect(() => {
    if (currentTag) {
      globalContext.tagId.set(currentTag.id);
      globalContext.isTag.set(true);

      return () => {
        globalContext.tagId.set(null);
        globalContext.isTag.set(false);
      };
    }
    return;
  }, [currentTag, globalContext]);

  if (!currentTag) {
    return <PageNotFound />;
  }

  return <TagDetail tag={currentTag} />;
};

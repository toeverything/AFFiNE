import {
  DocsService,
  GlobalContextService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import clsx from 'clsx';
import type { PropsWithChildren, ReactElement } from 'react';

import { islandContainer } from './container.css';

export const IslandContainer = (
  props: PropsWithChildren<{ className?: string }>
): ReactElement => {
  const docId = useLiveData(
    useService(GlobalContextService).globalContext.docId.$
  );
  const docRecordList = useService(DocsService).list;
  const doc = useLiveData(docId ? docRecordList.doc$(docId) : undefined);
  const inTrash = useLiveData(doc?.meta$)?.trash;
  return (
    <div className={clsx(islandContainer, { trash: inTrash }, props.className)}>
      {props.children}
    </div>
  );
};

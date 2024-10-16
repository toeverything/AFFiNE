import { PropertyName, PropertyRoot, PropertyValue } from '@affine/component';
import { i18nTime, useI18n } from '@affine/i18n';
import { DateTimeIcon, HistoryIcon } from '@blocksuite/icons/rc';
import {
  DocsService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import clsx from 'clsx';
import type { ConfigType } from 'dayjs';
import { useDebouncedValue } from 'foxact/use-debounced-value';
import { useMemo } from 'react';

import * as styles from './time-row.css';

export const TimeRow = ({
  docId,
  className,
}: {
  docId: string;
  className?: string;
}) => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const docsService = useService(DocsService);
  const { syncing, retrying, serverClock } = useLiveData(
    workspaceService.workspace.engine.doc.docState$(docId)
  );
  const docRecord = useLiveData(docsService.list.doc$(docId));
  const docMeta = useLiveData(docRecord?.meta$);

  const timestampElement = useMemo(() => {
    const formatI18nTime = (time: ConfigType) =>
      i18nTime(time, {
        relative: {
          max: [1, 'day'],
          accuracy: 'minute',
        },
        absolute: {
          accuracy: 'day',
        },
      });
    const localizedCreateTime = docMeta
      ? formatI18nTime(docMeta.createDate)
      : null;

    return (
      <>
        <PropertyRoot>
          <PropertyName name={t['Created']()} icon={<DateTimeIcon />} />
          <PropertyValue>
            {docMeta ? formatI18nTime(docMeta.createDate) : localizedCreateTime}
          </PropertyValue>
        </PropertyRoot>
        {serverClock ? (
          <PropertyRoot>
            <PropertyName
              name={t[
                !syncing && !retrying ? 'Updated' : 'com.affine.syncing'
              ]()}
              icon={<HistoryIcon />}
            />
            <PropertyValue>
              {!syncing && !retrying
                ? formatI18nTime(serverClock)
                : docMeta?.updatedDate
                  ? formatI18nTime(docMeta.updatedDate)
                  : null}
            </PropertyValue>
          </PropertyRoot>
        ) : docMeta?.updatedDate ? (
          <PropertyRoot>
            <PropertyName name={t['Updated']()} icon={<HistoryIcon />} />
            <PropertyValue>{formatI18nTime(docMeta.updatedDate)}</PropertyValue>
          </PropertyRoot>
        ) : null}
      </>
    );
  }, [docMeta, retrying, serverClock, syncing, t]);

  const dTimestampElement = useDebouncedValue(timestampElement, 500);

  return (
    <div className={clsx(styles.container, className)}>{dTimestampElement}</div>
  );
};

import { PropertyName, PropertyRoot, PropertyValue } from '@affine/component';
import { DocsService } from '@affine/core/modules/doc';
import { i18nTime, useI18n } from '@affine/i18n';
import { DateTimeIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
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
  const docsService = useService(DocsService);
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
      <PropertyRoot>
        <PropertyName name={t['Created']()} icon={<DateTimeIcon />} />
        <PropertyValue>
          {docMeta ? formatI18nTime(docMeta.createDate) : localizedCreateTime}
        </PropertyValue>
      </PropertyRoot>
    );
  }, [docMeta, t]);

  const dTimestampElement = useDebouncedValue(timestampElement, 500);

  return (
    <div className={clsx(styles.container, className)}>{dTimestampElement}</div>
  );
};

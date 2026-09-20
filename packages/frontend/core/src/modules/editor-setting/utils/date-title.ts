import { i18nTime } from '@affine/i18n';
import dayjs from 'dayjs';

import type { NewDocDateTitleFormat } from '../schema';

export const buildNewDocDateTitle = (
  date: dayjs.ConfigType,
  format: NewDocDateTitleFormat
) => {
  if (format === 'journal') {
    return i18nTime(date, {
      absolute: { accuracy: 'day' },
    });
  }

  return dayjs(date).format(format);
};

export const getUniqueNewDocDateTitle = ({
  existingTitles,
  format,
  date = new Date(),
}: {
  existingTitles: Iterable<string>;
  format: NewDocDateTitleFormat;
  date?: dayjs.ConfigType;
}) => {
  const normalizedTitles = new Set(existingTitles);
  const baseTitle = buildNewDocDateTitle(date, format);

  if (!normalizedTitles.has(baseTitle)) {
    return baseTitle;
  }

  let duplicateIndex = 2;
  while (normalizedTitles.has(`${baseTitle}(${duplicateIndex})`)) {
    duplicateIndex += 1;
  }

  return `${baseTitle}(${duplicateIndex})`;
};

export const resolveNewDocTitle = ({
  title,
  autoTitleEnabled,
  existingTitles,
  format,
  date = new Date(),
}: {
  title?: string;
  autoTitleEnabled: boolean;
  existingTitles: Iterable<string>;
  format: NewDocDateTitleFormat;
  date?: dayjs.ConfigType;
}) => {
  if (title?.trim()) return title;
  if (!autoTitleEnabled) return undefined;
  return getUniqueNewDocDateTitle({ existingTitles, format, date });
};

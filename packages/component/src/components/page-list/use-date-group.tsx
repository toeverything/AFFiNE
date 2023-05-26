import { useAFFiNEI18N } from '@affine/i18n/hooks';

import type { DateKey, ListData } from './type';
import {
  isLastMonth,
  isLastWeek,
  isLastYear,
  isToday,
  isYesterday,
} from './utils';

export const useDateGroup = ({
  data,
  key,
}: {
  data: ListData[];
  key?: DateKey;
}) => {
  const t = useAFFiNEI18N();
  if (!key) {
    return data.map(item => ({ ...item, groupName: '' }));
  }

  const fallbackGroup = {
    id: 'earlier',
    label: t['com.affine.earlier'](),
    match: (_date: Date) => true,
  };

  const groups = [
    {
      id: 'today',
      label: t['com.affine.today'](),
      match: (date: Date) => isToday(date),
    },
    {
      id: 'yesterday',
      label: t['com.affine.yesterday'](),
      match: (date: Date) => isYesterday(date) && !isToday(date),
    },
    {
      id: 'lastWeek',
      label: t['com.affine.lastWeek'](),
      match: (date: Date) => isLastWeek(date) && !isYesterday(date),
    },
    {
      id: 'lastMonth',
      label: t['com.affine.lastMonth'](),
      match: (date: Date) => isLastMonth(date) && !isLastWeek(date),
    },
    {
      id: 'lastYear',
      label: t['com.affine.lastYear'](),
      match: (date: Date) => isLastYear(date) && !isLastMonth(date),
    },
  ] as const;

  return data.map(item => {
    const group = groups.find(group => group.match(item[key])) ?? fallbackGroup;
    return {
      ...item,
      groupName: group.label,
    };
  });
};

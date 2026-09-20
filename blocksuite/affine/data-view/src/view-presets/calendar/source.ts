import { createIdentifier } from '@blocksuite/global/di';

import type { DataSource } from '../../core/data-source/base.js';
import type {
  CalendarExternalSource,
  CalendarStoredViewData,
} from './types.js';

export type CalendarExternalSourceFactory = {
  id: string;
  create(viewData: CalendarStoredViewData): CalendarExternalSource;
};

export const CalendarExternalSourceProvider =
  createIdentifier<CalendarExternalSourceFactory>('calendar-external-source');

export const getCalendarExternalSources = (
  dataSource: DataSource,
  viewData: CalendarStoredViewData
) =>
  Array.from(
    dataSource.provider.getAll(CalendarExternalSourceProvider).values()
  ).map(source => source.create(viewData));

import type { FilterGroup } from '../../core/filter/types.js';
import type { Sort } from '../../core/sort/types.js';
import type { BasicViewDataType } from '../../core/view/data-view.js';

export type CalendarWorkspaceSourceConfig = {
  enabled: boolean;
  subscriptionIds?: string[];
};

export type CalendarUiData = {
  emptyMonthHintDismissed?: boolean;
};

export type CalendarCardProperty = {
  propertyId: string;
  value: string;
};

export type CalendarTitleSegment = {
  text: string;
  linkedDoc?: boolean;
};

type CalendarViewDataShape = {
  filter: FilterGroup;
  sort?: Sort;
  date: {
    startColumnId?: string;
    endColumnId?: string;
  };
  card: {
    titleColumnId?: string;
    visiblePropertyIds: string[];
  };
  sources: {
    workspaceCalendar?: CalendarWorkspaceSourceConfig;
  };
  ui?: CalendarUiData;
};

export type CalendarViewData = BasicViewDataType<
  'calendar',
  CalendarViewDataShape
>;

export type CalendarStoredViewData = CalendarViewData;

export type CalendarEntryBase = {
  id: string;
  sourceId: string;
  title: string;
  color?: string;
  startAt: number;
  endAt?: number;
  allDay?: boolean;
};

export type CalendarRowEntry = CalendarEntryBase & {
  kind: 'row';
  sourceId: 'database';
  rowId: string;
  titleSegments?: CalendarTitleSegment[];
  cardProperties: CalendarCardProperty[];
  canResizeRange: boolean;
};

export type CalendarExternalEntry = CalendarEntryBase & {
  kind: 'external';
  sourceId: string;
  externalId: string;
  calendarName?: string;
  location?: string;
  description?: string;
  canResizeRange: false;
};

export type CalendarEntry = CalendarRowEntry | CalendarExternalEntry;

export type CalendarEntryRange = {
  from: number;
  to: number;
};

export type CalendarExternalSource = {
  id: string;
  getSubscriptionOptions?(): CalendarExternalSourceSubscription[];
  openConnectSettings?(): void;
  getEntries(
    range: CalendarEntryRange
  ): CalendarExternalEntry[] | Promise<CalendarExternalEntry[]>;
};

export type CalendarExternalSourceSubscription = {
  id: string;
  name: string;
  color?: string;
};

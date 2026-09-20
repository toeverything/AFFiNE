import { CALENDAR_INTEGRATION_SCROLL_ANCHOR } from '@affine/core/desktop/dialogs/setting/navigation-constants';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { IntegrationService } from '@affine/core/modules/integration';
import type {
  CalendarEntryRange,
  CalendarExternalEntry,
  CalendarViewData,
} from '@blocksuite/data-view/view-presets';
import type { FrameworkProvider } from '@toeverything/infra';
import dayjs from 'dayjs';

type CalendarIntegrationLike = IntegrationService['calendar'];

type CalendarEventPayload = Awaited<
  ReturnType<CalendarIntegrationLike['revalidateEventsRange']>
>[number];

const calendarColorPalette = [
  '#2f7d32',
  '#b45309',
  '#ad3b69',
  '#8f6a00',
  '#6f6b2f',
  '#9f4f1a',
] as const;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const parseHexColor = (color: string) => {
  const hex = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return;
  }
  const value =
    match[1].length === 3
      ? match[1]
          .split('')
          .map(char => char + char)
          .join('')
      : match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
};

const getColorHue = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  if (max === red) {
    return ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
  }
  if (max === green) {
    return ((blue - red) / delta + 2) * 60;
  }
  return ((red - green) / delta + 4) * 60;
};

const isMutedCalendarColor = (color: string) => {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return true;
  }
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 510;
  const saturation =
    max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
  const hue = getColorHue(rgb);
  return (
    lightness > 0.9 ||
    saturation < 0.18 ||
    (hue >= 190 && hue <= 260 && saturation > 0.18)
  );
};

const getCalendarColor = (subscriptionId: string, color?: string | null) => {
  if (color && !isMutedCalendarColor(color)) {
    return color;
  }
  return calendarColorPalette[
    hashString(subscriptionId) % calendarColorPalette.length
  ];
};

export const selectWorkspaceCalendarSubscriptionIds = (
  workspaceItems: Array<{
    subscriptionId: string;
    enabled: boolean;
  }>,
  viewConfig?: CalendarViewData['sources']['workspaceCalendar']
) => {
  if (!viewConfig?.enabled) {
    return new Set<string>();
  }
  const viewIds = viewConfig.subscriptionIds
    ? new Set(viewConfig.subscriptionIds)
    : undefined;
  return new Set(
    workspaceItems
      .filter(item => item.enabled)
      .filter(item => !viewIds || viewIds.has(item.subscriptionId))
      .map(item => item.subscriptionId)
  );
};

export const calendarEventToExternalEntry = (
  event: CalendarEventPayload,
  options?: {
    color?: string | null;
    calendarName?: string;
  }
) =>
  ({
    kind: 'external',
    id: `workspace-calendar:${event.id}`,
    sourceId: 'workspace-calendar',
    externalId: event.externalEventId ?? event.id,
    title: event.title ?? '',
    color:
      options?.color !== undefined
        ? getCalendarColor(event.subscriptionId, options.color)
        : getCalendarColor(event.subscriptionId),
    calendarName: options?.calendarName,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    startAt: dayjs(event.startAtUtc).valueOf(),
    endAt: dayjs(event.endAtUtc).valueOf(),
    allDay: event.allDay,
    canResizeRange: false,
  }) as CalendarExternalEntry;

export class WorkspaceCalendarExternalSource {
  id = 'workspace-calendar';

  constructor(
    private readonly calendar: CalendarIntegrationLike | undefined,
    private readonly hasServer: () => boolean,
    private readonly viewData: CalendarViewData,
    private readonly openSettings?: () => void
  ) {}

  openConnectSettings() {
    this.openSettings?.();
  }

  async getEntries(range: CalendarEntryRange) {
    const calendar = this.calendar;
    if (!calendar || !this.hasServer()) {
      return [];
    }

    const workspaceCalendars =
      calendar.workspaceCalendars$.value.length > 0
        ? calendar.workspaceCalendars$.value
        : await calendar.revalidateWorkspaceCalendars().catch(() => []);
    if (calendar.accountCalendars$.value.size === 0) {
      const accountCalendars = await calendar
        .loadAccountCalendars()
        .catch(() => undefined);
      if (!accountCalendars) {
        return [];
      }
    }

    const workspaceCalendar = workspaceCalendars[0];
    const workspaceItems = workspaceCalendar?.items ?? [];
    const subscriptionIds = selectWorkspaceCalendarSubscriptionIds(
      workspaceItems,
      this.viewData.sources?.workspaceCalendar
    );
    if (subscriptionIds.size === 0) {
      return [];
    }

    const events = await calendar
      .revalidateEventsRange(dayjs(range.from), dayjs(range.to))
      .catch(() => []);
    const infoBySubscriptionId = this.getSubscriptionInfo();
    const colorBySubscriptionId = new Map<string, string | null | undefined>();
    for (const calendars of calendar.accountCalendars$.value.values()) {
      for (const subscription of calendars) {
        colorBySubscriptionId.set(subscription.id, subscription.color);
      }
    }
    for (const item of workspaceItems) {
      if (item.colorOverride) {
        colorBySubscriptionId.set(item.subscriptionId, item.colorOverride);
      }
    }

    return events
      .filter(event => subscriptionIds.has(event.subscriptionId))
      .map(event =>
        calendarEventToExternalEntry(event, {
          color: getCalendarColor(
            event.subscriptionId,
            colorBySubscriptionId.get(event.subscriptionId)
          ),
          calendarName: infoBySubscriptionId.get(event.subscriptionId)?.name,
        })
      );
  }

  getSubscriptionOptions() {
    const workspaceItems =
      this.calendar?.workspaceCalendars$.value[0]?.items ?? [];
    const enabledIds = new Set(
      workspaceItems
        .filter(item => item.enabled)
        .map(item => item.subscriptionId)
    );
    return [...this.getSubscriptionInfo()]
      .filter(([id]) => enabledIds.has(id))
      .map(([id, info]) => ({
        id,
        name: info.name,
        color: getCalendarColor(
          id,
          workspaceItems.find(item => item.subscriptionId === id)
            ?.colorOverride ?? info.color
        ),
      }));
  }

  private getSubscriptionInfo() {
    const infoBySubscriptionId = new Map<
      string,
      {
        name: string;
        color?: string | null;
      }
    >();
    for (const calendars of this.calendar?.accountCalendars$.value.values() ??
      []) {
      for (const subscription of calendars) {
        infoBySubscriptionId.set(subscription.id, {
          name:
            subscription.displayName ??
            subscription.externalCalendarId ??
            subscription.id,
          color: subscription.color,
        });
      }
    }
    return infoBySubscriptionId;
  }
}

export const createWorkspaceCalendarExternalSource = (
  framework?: FrameworkProvider
) => {
  if (!framework) {
    return {
      id: 'workspace-calendar',
      create: (viewData: CalendarViewData) =>
        new WorkspaceCalendarExternalSource(undefined, () => false, viewData),
    };
  }
  const integration = framework.get(IntegrationService);
  const server = framework.get(WorkspaceServerService);
  const dialog = framework.get(WorkspaceDialogService);
  return {
    id: 'workspace-calendar',
    create: (viewData: CalendarViewData) =>
      new WorkspaceCalendarExternalSource(
        integration.calendar,
        () => !!server.server,
        viewData,
        () =>
          dialog.open('setting', {
            activeTab: 'workspace:integrations',
            scrollAnchor: CALENDAR_INTEGRATION_SCROLL_ANCHOR,
          })
      ),
  };
};

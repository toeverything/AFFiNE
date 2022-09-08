import type {
    BlockClientInstance,
    BlockImplInstance,
} from '@toeverything/datasource/jwt';
import { getDateIsoStringWithTimezone } from '@toeverything/utils';
import getDaysInMonth from 'date-fns/getDaysInMonth';
import color, { ColorInput } from 'tinycolor2';

import type { CalendarDay, Theme } from './types';

// export const DEFAULT_THEME = createCalendarTheme('#3E6FDB');
export const DEFAULT_THEME: Theme = {
    level4: '#3E6FDB',
    level3: 'rgba(62, 111, 219)',
    level2: 'rgba(62, 111, 219, 0.5)',
    level1: 'rgba(62, 111, 219, 0.2)',
};

export function createCalendarTheme(
    baseColor: ColorInput,
    emptyColor = color('white').darken(8).toHslString()
): Theme {
    const base = color(baseColor);

    if (!base.isValid()) {
        return DEFAULT_THEME;
    }

    return {
        level4: base.setAlpha(0.92).toHslString(),
        level3: base.setAlpha(0.76).toHslString(),
        level2: base.setAlpha(0.6).toHslString(),
        level1: base.setAlpha(0.44).toHslString(),
        // level0: emptyColor
    };
}

function getRandomNumber(min: number, max: number) {
    return Math.round(Math.random() * (max - min) + min);
}

export async function fetchActivitiesHeatmap(
    db: BlockClientInstance,
    date: Date,
    flattenedItems: any[]
): Promise<{ daysToHighlight: CalendarDay[] }> {
    // const pages = await db.getByType('page');
    const pages_with_ids = (await Promise.all(
        flattenedItems.map(async (page_item: any) => {
            const pageId = page_item.id;
            return [pageId, await db.get(pageId as 'page')];
        })
    )) as [string, BlockImplInstance][];
    const pages = new Map(pages_with_ids);

    const blocks = pages.values();
    const pages_by_month = {} as Record<string, BlockImplInstance[]>;

    for (const page of blocks) {
        const page_created_month = getDateIsoStringWithTimezone(
            page.created
        ).slice(0, 7);
        if (!pages_by_month[page_created_month]) {
            pages_by_month[page_created_month] = [page];
        } else {
            pages_by_month[page_created_month].push(page);
        }
    }

    const result_date_key = getDateIsoStringWithTimezone(date.getTime()).slice(
        0,
        7
    );
    if (!pages_by_month[result_date_key]) {
        return { daysToHighlight: [] };
    }

    const pages_by_day = {} as Record<string, BlockImplInstance[]>;
    const daysToHighlight = [] as CalendarDay[];
    pages_by_month[result_date_key].forEach(page => {
        const page_created_date = new Date(page.created).getDate();
        if (!pages_by_day[page_created_date]) {
            pages_by_day[page_created_date] = [page];
        } else {
            pages_by_day[page_created_date].push(page);
        }
    });

    Object.keys(pages_by_day).forEach(day => {
        daysToHighlight.push({
            dayInMonth: Number(day),
            activitiesOfDay: pages_by_day[day].length,
        });
    });

    return { daysToHighlight };
}

export async function fakeFetch(
    date: Date,
    { signal }: { signal?: AbortSignal } = {}
): Promise<{ daysToHighlight: CalendarDay[] }> {
    return new Promise((resolve, reject) => {
        // const timeout = setTimeout(() => {
        const daysInMonth = getDaysInMonth(date);
        const daysToHighlight = Array(7)
            .fill(1)
            .map(() => {
                const countOfDay = getRandomNumber(1, daysInMonth);
                return {
                    dayInMonth: countOfDay,
                    activitiesOfDay: countOfDay,
                };
            });
        resolve({ daysToHighlight });
        // }, 0);

        if (signal) {
            signal.onabort = () => {
                // clearTimeout(timeout);
                reject(new DOMException('aborted', 'AbortError'));
            };
        }
    });
}

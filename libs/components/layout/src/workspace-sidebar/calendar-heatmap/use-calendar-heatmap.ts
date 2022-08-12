import type { PickersDayProps } from '@toeverything/components/ui';
import { atom, useAtom } from 'jotai';
import { createElement, useCallback, useState } from 'react';

import type { CalendarHeatmapProps } from './CalendarHeatmap';
import { HeatedDay } from './HeatedDay';
import type { CalendarDay } from './types';
// import { usePageTree } from 'PageTree';

const highlightedDaysAtom = atom<CalendarDay[] | undefined>([]);

export const useCalendarHeatmap = ({
    calendarTheme,
}: CalendarHeatmapProps = {}) => {
    const [loading, setLoading] = useState(false);
    const [highlightedDays, setHighlightedDays] = useAtom(highlightedDaysAtom);
    const [pickDay, setPickDay] = useState<Date | null>(null);

    // const { flattenedItems } = usePageTree();

    const fetchHighlightedDays = useCallback(
        async (date?: Date) => {
            // const { daysToHighlight } = await fetchActivitiesHeatmap(db, date || new Date(), flattenedItems);
            // setHighlightedDays(daysToHighlight);
            setHighlightedDays([]);
            // setLoading(false);
        },
        [setHighlightedDays]
    );

    const handleMonthChange = useCallback(
        (date: Date) => {
            // setLoading(true);
            // setHighlightedDays([]);
            fetchHighlightedDays(date);
        },
        [fetchHighlightedDays]
    );

    const addPageToday = useCallback(() => {
        const foundToday = highlightedDays?.find(
            hDay => hDay.dayInMonth === new Date().getDate()
        );
        if (foundToday) {
            setHighlightedDays([
                ...highlightedDays.filter(
                    day => day.dayInMonth !== foundToday.dayInMonth
                ),
                {
                    ...foundToday,
                    activitiesOfDay: foundToday.activitiesOfDay + 1,
                },
            ]);
        } else {
            setHighlightedDays([
                ...highlightedDays,
                { dayInMonth: new Date().getDate(), activitiesOfDay: 1 },
            ]);
        }
    }, [highlightedDays, setHighlightedDays]);

    const renderDayWithHeatmap = useCallback(
        (
            day: Date,
            selectedDates: Array<Date | null>,
            pickersDayProps: PickersDayProps<Date>
        ) => {
            const foundDay = highlightedDays?.find(
                hDay => hDay.dayInMonth === day.getDate()
            );
            const isSelected = !pickersDayProps.outsideCurrentMonth && foundDay;

            return createElement(HeatedDay, {
                ...pickersDayProps,
                calendarTheme,
                activitiesOfDay: isSelected ? foundDay.activitiesOfDay : 0,
            });
            // return (
            //     <HeatedDay
            //         {...pickersDayProps}
            //         calendarTheme={calendarTheme}
            //         activitiesOfDay={isSelected ? foundDay.activitiesOfDay : 0}
            //     />
            // );
        },
        [highlightedDays, calendarTheme]
    );

    return {
        loading,
        fetchHighlightedDays,
        pickDay,
        setPickDay,
        handleMonthChange,
        renderDayWithHeatmap,
        addPageToday,
    };
};

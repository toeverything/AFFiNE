import {
    AdapterDateFns,
    // CalendarPickerSkeleton,
    LocalizationProvider,
    MuiBox as Box,
    MuiTextField as TextField,
    StaticDatePicker,
} from '@toeverything/components/ui';
import { useEffect } from 'react';

import type { Theme } from './types';
import { useCalendarHeatmap } from './use-calendar-heatmap';

export type CalendarHeatmapProps = {
    calendarTheme?: Theme;
};

/** Calendar heat map component, different colors represent the number of operation records on the day */
export function CalendarHeatmap({ calendarTheme }: CalendarHeatmapProps) {
    const {
        fetchHighlightedDays,
        pickDay,
        setPickDay,
        handleMonthChange,
        renderDayWithHeatmap,
    } = useCalendarHeatmap({ calendarTheme });

    useEffect(() => {
        fetchHighlightedDays();
    }, [fetchHighlightedDays]);

    return (
        <Box
            id="affineCalendarHeatmapContainer"
            sx={{
                // flex: 1,
                '.MuiPickerStaticWrapper-root': {
                    minWidth: 240,
                },
                '.MuiCalendarPicker-root': {
                    width: 280,
                    margin: 0,
                    marginLeft: '-8px',
                    '& > div': {
                        marginTop: 0,
                    },
                    '& .PrivatePickersFadeTransitionGroup-root > div': {
                        color: '#98acbd',
                        fontSize: '0.8rem',
                    },
                    "& > div > div[role='presentation']": {
                        marginLeft: '8px',
                    },
                    "& div[role='presentation'] > button:first-of-type": {
                        display: 'none',
                    },
                    '& .PrivatePickersSlideTransition-root': {
                        minHeight: 290,
                    },
                    '& .MuiIconButton-sizeSmall svg': {
                        color: '#98acbd',
                    },
                    "& div[class][style*='cubic-bezier']": {
                        marginRight: '8px',
                    },
                    "& div[class][style*='cubic-bezier'] > div": {
                        width: '8px',
                    },
                    '& .PrivatePickersFadeTransitionGroup-root.MuiCalendarPicker-viewTransitionContainer':
                        {
                            height: 260,
                        },
                    '& .MuiCalendarPicker-viewTransitionContainer .MuiTypography-caption':
                        {
                            width: 30,
                            height: 30,
                        },
                },
            }}
        >
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <StaticDatePicker
                    value={pickDay}
                    onChange={setPickDay}
                    displayStaticWrapperAs="desktop"
                    onMonthChange={handleMonthChange}
                    label="Week picker"
                    inputFormat="'Week of' MMM d"
                    renderInput={params => <TextField {...(params as any)} />}
                    renderDay={renderDayWithHeatmap}
                    disableHighlightToday={true}
                    autoFocus={false}
                    // loading={loading}
                    // renderLoading={() => <CalendarPickerSkeleton />}
                />
            </LocalizationProvider>
        </Box>
    );
}

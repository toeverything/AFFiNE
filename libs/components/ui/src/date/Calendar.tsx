import React from 'react';
import {
    Calendar as ReactCalendar,
    type CalendarProps,
} from 'react-date-range';
import { useTheme } from '../theme';

export { CalendarProps };

export const Calendar = (props: CalendarProps) => {
    const theme = useTheme();

    return <ReactCalendar color={theme.affine.palette.primary} {...props} />;
};

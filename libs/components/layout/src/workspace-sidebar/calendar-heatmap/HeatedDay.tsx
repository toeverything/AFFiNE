import {
    PickersDay,
    styled,
    type PickersDayProps,
} from '@toeverything/components/ui';
import type { ComponentType } from 'react';

import type { Theme } from './types';
import { DEFAULT_THEME } from './utils';

type HeatedDayProps = PickersDayProps<Date> & {
    activitiesOfDay: number;
    calendarTheme: Theme;
};

export const HeatedDay = styled(PickersDay, {
    shouldForwardProp: (prop: string) =>
        !['activitiesOfDay', 'calendarTheme'].includes(prop),
})<HeatedDayProps>(({ calendarTheme = DEFAULT_THEME, activitiesOfDay }) => ({
    ...{
        width: 30,
        height: 30,
        margin: '0 2.5px 16px 2.5px',
        borderRadius: 3,
        backgroundColor: '#fff',
        color: '#4E687C',
        // fontSize: '0.8rem'
    },
    ...(activitiesOfDay > 0 && {
        backgroundColor: calendarTheme.level1,
        '&:hover': {
            backgroundColor: calendarTheme.level1,
        },
    }),
    ...(activitiesOfDay > 3 && {
        backgroundColor: calendarTheme.level2,
        '&:hover': {
            backgroundColor: calendarTheme.level2,
        },
    }),
    ...(activitiesOfDay > 6 && {
        backgroundColor: calendarTheme.level3,
        color: '#fff',
        '&:hover': {
            backgroundColor: calendarTheme.level3,
        },
    }),
})) as unknown as ComponentType<HeatedDayProps>;

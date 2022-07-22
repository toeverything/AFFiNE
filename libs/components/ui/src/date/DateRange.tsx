import {
    DateRange as ReactDateRange,
    type DateRangeProps,
    type Range,
} from 'react-date-range';
import { useTheme } from '../theme';

export { DateRangeProps, Range };

export const DateRange = (props: DateRangeProps) => {
    const theme = useTheme();

    return (
        <ReactDateRange
            color={theme.affine.palette.primary}
            rangeColors={[theme.affine.palette.primary]}
            {...props}
        />
    );
};

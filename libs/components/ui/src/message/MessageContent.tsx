import { forwardRef } from 'react';
import { NotificationContentProps } from '../notification';
/* eslint-disable no-restricted-imports */
import Alert from '@mui/material/Alert';

// TODO: Variants types of message content await designers
const commonStyle = { background: '#fff' };
export const SuccessMessage = forwardRef<
    HTMLDivElement,
    NotificationContentProps
>(({ message, id }, ref) => {
    return (
        <Alert
            variant="outlined"
            severity="success"
            ref={ref}
            style={commonStyle}
        >
            {message}
        </Alert>
    );
});

export const ErrorMessage = forwardRef<
    HTMLDivElement,
    NotificationContentProps
>(({ message, id }, ref) => {
    return (
        <Alert
            variant="outlined"
            severity="error"
            ref={ref}
            style={commonStyle}
        >
            {message}
        </Alert>
    );
});

export const WarningMessage = forwardRef<
    HTMLDivElement,
    NotificationContentProps
>(({ message, id }, ref) => {
    return (
        <Alert
            variant="outlined"
            severity="warning"
            ref={ref}
            style={commonStyle}
        >
            {message}
        </Alert>
    );
});

export const InfoMessage = forwardRef<HTMLDivElement, NotificationContentProps>(
    ({ message, id }, ref) => {
        return (
            <Alert
                variant="outlined"
                severity="info"
                ref={ref}
                style={commonStyle}
            >
                {message}
            </Alert>
        );
    }
);

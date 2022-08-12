import { forwardRef, useImperativeHandle } from 'react';

import {
    SnackbarProvider,
    useSnackbar,
    type OptionsObject,
    type SnackbarKey,
    type SnackbarMessage,
    type SnackbarProviderProps,
} from 'notistack';
import { createRoot } from 'react-dom/client';

export type NotificationController = {
    add: (message: SnackbarMessage, options?: OptionsObject) => SnackbarKey;
    close: (key?: SnackbarKey) => void;
};
export type NotificationInstanceProps = Omit<SnackbarProviderProps, 'children'>;
export type NotificationContentProps = {
    id: SnackbarKey;
    message: SnackbarMessage;
};
export type NotificationContent = SnackbarMessage;
export type NotificationOption = OptionsObject;
export type NotificationKey = SnackbarKey;

const Notification = forwardRef<NotificationController>((props, ref) => {
    const { enqueueSnackbar, closeSnackbar } = useSnackbar();

    useImperativeHandle(ref, () => ({
        add: (message, options) => {
            return enqueueSnackbar(message, options);
        },
        close: key => closeSnackbar(key),
    }));

    return null;
});

export const NotificationInstance = (
    snackbarProviderProps: NotificationInstanceProps,
    callback: (notificationController: NotificationController) => void
) => {
    const rootElement = document.createElement('div');
    document.body.appendChild(rootElement);
    const reactRoot = createRoot(rootElement);
    // ReactDOM.unmountComponentAtNode will call the ref function again after execution, called to prevent repeated calls
    let called = false;
    // react mounted dom is async
    const ref = async (notificationController: NotificationController) => {
        if (called) {
            return;
        }
        called = true;
        callback(notificationController);
    };

    reactRoot.render(
        <SnackbarProvider {...snackbarProviderProps}>
            <Notification ref={ref} />
        </SnackbarProvider>
    );
};

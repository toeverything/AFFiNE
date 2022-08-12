import {
    NotificationInstance,
    type NotificationContent,
    type NotificationController,
    type NotificationInstanceProps,
    type NotificationKey,
    type NotificationOption,
} from '../notification';
import {
    ErrorMessage,
    InfoMessage,
    SuccessMessage,
    WarningMessage,
} from './MessageContent';

type MessageMethod = (
    message: NotificationContent,
    option?: Omit<NotificationOption, 'content'>
) => Promise<NotificationKey>;

export class Message {
    private _notificationController: NotificationController = null;
    private _notificationProps: NotificationInstanceProps = {};

    constructor(props: NotificationInstanceProps) {
        this._notificationProps = props;
    }

    private _ensureController() {
        if (!this._notificationController) {
            NotificationInstance(
                this._notificationProps,
                notificationController => {
                    this._notificationController = notificationController;
                }
            );
        }
    }

    public success: MessageMethod = async (message, option) => {
        await this._ensureController();

        return this._notificationController.add(message, {
            content: (key, message) => (
                <SuccessMessage id={key} message={message} />
            ),
            ...option,
        });
    };

    public error: MessageMethod = async (message, option) => {
        await this._ensureController();

        return this._notificationController.add(message, {
            content: (key, message) => (
                <ErrorMessage id={key} message={message} />
            ),
            ...option,
        });
    };

    public warning: MessageMethod = async (message, option) => {
        await this._ensureController();

        return this._notificationController.add(message, {
            content: (key, message) => (
                <WarningMessage id={key} message={message} />
            ),
            ...option,
        });
    };

    public info: MessageMethod = async (message, option) => {
        await this._ensureController();

        return this._notificationController.add(message, {
            content: (key, message) => (
                <InfoMessage id={key} message={message} />
            ),
            ...option,
        });
    };
}

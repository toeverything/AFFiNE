import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
} from 'electron';
import { BehaviorSubject } from 'rxjs';

import { popupViewUrl } from '../constants';
import { logger } from '../logger';
import type { MainEventRegister, NamespaceHandlers } from '../type';
import { buildWebPreferences } from '../web-preferences';
import { getCurrentDisplay } from './utils';

type PopupWindowType = 'notification' | 'recording';

async function getAdditionalArguments(name: string) {
  const { getExposedMeta } = await import('../exposed');
  const mainExposedMeta = getExposedMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--window-name=${name}`,
  ];
}

const POPUP_PADDING = 20; // padding between the popup and the edge of the screen
const NOTIFICATION_SIZE = [300, 128];
const RECORDING_SIZE = [300, 36];

async function animate(
  current: number,
  target: number,
  setter: (val: number) => void,
  duration = 200,
  delay = 0
): Promise<void> {
  const fps = 60;
  const steps = duration / (1000 / fps);
  const delta = target - current;
  const easing = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

  if (delay > 0) {
    await setTimeout(delay);
  }

  for (let i = 0; i < steps; i++) {
    const progress = easing(i / steps);
    setter(current + delta * progress);
    await setTimeout(1000 / fps);
  }

  // Ensure we hit the target exactly
  setter(target);
}

abstract class PopupWindow {
  abstract readonly type: PopupWindowType;
  abstract readonly name: string;
  browserWindow: BrowserWindow | undefined;

  abstract windowOptions: Partial<BrowserWindowConstructorOptions>;

  ready = Promise.withResolvers<void>();

  private readonly showing$ = new BehaviorSubject<boolean>(false);

  get showing() {
    return this.showing$.value;
  }

  async build(): Promise<BrowserWindow> {
    const browserWindow = new BrowserWindow({
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      alwaysOnTop: true,
      hiddenInMissionControl: true,
      skipTaskbar: true,
      movable: false,
      titleBarStyle: 'hidden',
      show: false, // hide by default,
      backgroundColor: 'transparent',
      visualEffectState: 'active',
      vibrancy: 'under-window',
      ...this.windowOptions,
      webPreferences: buildWebPreferences({
        webgl: true,
        transparent: true,
        spellcheck: false,
        preload: join(__dirname, './preload.js'), // this points to the bundled preload module
        ...this.windowOptions.webPreferences,
        // serialize exposed meta that to be used in preload
        additionalArguments: await getAdditionalArguments(this.name),
      }),
    });

    // it seems that the dock will disappear when popup windows are shown
    await app.dock?.show();

    // required to make the window transparent
    browserWindow.setBackgroundColor('#00000000');
    browserWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });

    logger.info('loading popup', this.name, popupViewUrl);
    browserWindow.webContents.on('did-finish-load', () => {
      this.ready.resolve();
      logger.info('popup ready', this.name);
    });
    browserWindow.loadURL(popupViewUrl).catch(err => logger.error(err));
    return browserWindow;
  }

  async show() {
    if (!this.browserWindow) {
      this.browserWindow = await this.build();
    }
    const browserWindow = this.browserWindow;
    const workArea = getCurrentDisplay(browserWindow).workArea;
    const popupSize = browserWindow.getSize();

    await this.ready.promise;

    this.showing$.next(true);

    browserWindow.showInactive(); // focus the notification is too distracting right?
    browserWindow.setOpacity(0);

    // Calculate start and end positions for x coordinate
    const startX = workArea.x + workArea.width + popupSize[0] + POPUP_PADDING;
    const endX = workArea.x + workArea.width - popupSize[0] - POPUP_PADDING;
    const y = workArea.y + POPUP_PADDING;

    // Set initial position
    browserWindow.setPosition(startX, y);

    logger.info('showing popup', this.name);

    // First fade in, then slide
    await Promise.all([
      // Slide in animation
      animate(
        startX,
        endX,
        x => {
          browserWindow.setPosition(Math.round(x), y);
        },
        300
      ),
      // Fade in animation
      animate(
        0,
        1,
        opacity => {
          this.browserWindow?.setOpacity(opacity);
        },
        100,
        100
      ),
    ]);
  }

  async hide() {
    if (!this.browserWindow) {
      return;
    }
    logger.info('hiding popup', this.name);
    this.showing$.next(false);
    await animate(this.browserWindow.getOpacity(), 0, opacity => {
      this.browserWindow?.setOpacity(opacity);
    });
    this.browserWindow?.hide();
  }

  destroy() {
    this.browserWindow?.destroy();
  }
}

// leave for future use
type ElectronNotification = null;

class NotificationPopupWindow extends PopupWindow {
  readonly type = 'notification' as const;
  readonly name = `${this.type}`;

  notification$ = new BehaviorSubject<ElectronNotification | null>(null);

  windowOptions: Partial<BrowserWindowConstructorOptions> = {
    width: NOTIFICATION_SIZE[0],
    height: NOTIFICATION_SIZE[1],
  };

  async notify(notification: ElectronNotification) {
    this.notification$.next(notification);
    await super.show();
  }
}

// recording popup window is singleton across the app
class RecordingPopupWindow extends PopupWindow {
  readonly type = 'recording' as const;
  readonly name = `${this.type}`;
  windowOptions: Partial<BrowserWindowConstructorOptions> = {
    width: RECORDING_SIZE[0],
    height: RECORDING_SIZE[1],
    movable: true,
  };
}

// Type mapping from PopupWindowType to specific window class
type PopupWindowTypeMap = {
  notification: NotificationPopupWindow;
  recording: RecordingPopupWindow;
};

export class PopupManager {
  static readonly instance = new PopupManager();
  // there could be a single instance of each type of popup window
  readonly popupWindows$ = new BehaviorSubject<Map<string, PopupWindow>>(
    new Map()
  );

  get<T extends PopupWindowType>(type: T): PopupWindowTypeMap[T] {
    // Check if popup of this type already exists
    const existingPopup = Array.from(this.popupWindows$.value.values()).find(
      popup => popup.type === type
    ) as PopupWindowTypeMap[T] | undefined;

    // If exists, return it
    if (existingPopup) {
      return existingPopup;
    }

    // Otherwise create a new one
    const popupWindow = (() => {
      switch (type) {
        case 'notification':
          return new NotificationPopupWindow() as PopupWindowTypeMap[T];
        case 'recording':
          return new RecordingPopupWindow() as PopupWindowTypeMap[T];
        default:
          throw new Error(`Unknown popup type: ${type}`);
      }
    })();

    this.popupWindows$.next(
      new Map(this.popupWindows$.value).set(popupWindow.type, popupWindow)
    );
    return popupWindow;
  }
}

export const popupManager = PopupManager.instance;

// recording popup window events/handlers are in ../recording/index.ts
export const popupHandlers = {
  getCurrentNotification: async () => {
    const notification = popupManager.get('notification').notification$.value;
    if (!notification) {
      return null;
    }
    return notification;
  },
  dismissCurrentNotification: async () => {
    return popupManager.get('notification').hide();
  },
  dismissCurrentRecording: async () => {
    return popupManager.get('recording').hide();
  },
} satisfies NamespaceHandlers;

export const popupEvents = {
  onNotificationChanged: (
    callback: (notification: ElectronNotification | null) => void
  ) => {
    const notification = popupManager.get('notification');
    const sub = notification.notification$.subscribe(notification => {
      callback(notification);
    });
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;

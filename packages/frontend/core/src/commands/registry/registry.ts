import { DebugLogger } from '@affine/debug';
// @ts-expect-error upstream type is wrong
import { createKeybindingsHandler } from 'tinykeys';

import type { AffineCommand, AffineCommandOptions } from './command';
import { createAffineCommand } from './command';

const commandLogger = new DebugLogger('command:registry');

interface KeyBindingMap {
  [keybinding: string]: (event: KeyboardEvent) => void;
}

export interface KeyBindingOptions {
  /**
   * Key presses will listen to this event (default: "keydown").
   */
  event?: 'keydown' | 'keyup';

  /**
   * Whether to capture the event during the capture phase (default: false).
   */
  capture?: boolean;

  /**
   * Keybinding sequences will wait this long between key presses before
   * cancelling (default: 1000).
   *
   * **Note:** Setting this value too low (i.e. `300`) will be too fast for many
   * of your users.
   */
  timeout?: number;
}

const bindKeys = (
  target: Window | HTMLElement,
  keyBindingMap: KeyBindingMap,
  options: KeyBindingOptions = {}
) => {
  const event = options.event ?? 'keydown';
  const onKeyEvent = createKeybindingsHandler(keyBindingMap, options);
  target.addEventListener(event, onKeyEvent, options.capture);
  return () => {
    target.removeEventListener(event, onKeyEvent, options.capture);
  };
};

// On macOS, Option+letter types a character (e.g. "ß" on the US layout,
// "ś" on the Polish one) and the event alone cannot tell which the user meant.
// Inside an editable element it is text input; elsewhere there is no text to
// type, so the shortcut bound to the physical key runs.
const isAltTextInput = (event: KeyboardEvent) => {
  if (
    !event.altKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.key.length !== 1 ||
    event.key.charCodeAt(0) <= 0x7e
  ) {
    return false;
  }
  const target = event.composedPath()[0];
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
  );
};

export const AffineCommandRegistry = new (class {
  readonly commands: Map<string, AffineCommand> = new Map();

  register(options: AffineCommandOptions) {
    if (this.commands.has(options.id)) {
      commandLogger.warn(`Command ${options.id} already registered.`);
      return () => {};
    }
    const command = createAffineCommand(options);
    this.commands.set(command.id, command);

    let unsubKb: (() => void) | undefined;

    if (
      command.keyBinding &&
      !command.keyBinding.skipRegister &&
      typeof window !== 'undefined'
    ) {
      const { binding: keybinding, capture } = command.keyBinding;
      unsubKb = bindKeys(
        window,
        {
          [keybinding]: (e: Event) => {
            if (e instanceof KeyboardEvent && isAltTextInput(e)) {
              return;
            }
            e.preventDefault();
            command.run()?.catch(e => {
              console.error(`Failed to run command [${command.id}]`, e);
            });
          },
        },
        {
          capture,
        }
      );
    }

    commandLogger.debug(`Registered command ${command.id}`);
    return () => {
      unsubKb?.();
      this.commands.delete(command.id);
      commandLogger.debug(`Unregistered command ${command.id}`);
    };
  }

  get(id: string): AffineCommand | undefined {
    if (!this.commands.has(id)) {
      commandLogger.warn(`Command ${id} not registered.`);
      return undefined;
    }
    return this.commands.get(id);
  }

  getAll(): AffineCommand[] {
    return Array.from(this.commands.values());
  }
})();

export function registerAffineCommand(options: AffineCommandOptions) {
  return AffineCommandRegistry.register(options);
}

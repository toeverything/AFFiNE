// @ts-expect-error upstream type is wrong
import { tinykeys } from 'tinykeys';

import {
  type AffineCommand,
  type AffineCommandOptions,
  createAffineCommand,
} from './command';

export const AffineCommandRegistry = new (class {
  readonly commands: Map<string, AffineCommand> = new Map();

  register(options: AffineCommandOptions) {
    if (this.commands.has(options.id)) {
      console.warn(`Command ${options.id} already registered.`);
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
      const { binding: keybinding } = command.keyBinding;
      unsubKb = tinykeys(window, {
        [keybinding]: async (e: Event) => {
          e.preventDefault();
          try {
            await command.run();
          } catch (e) {
            console.error(`Failed to invoke keybinding [${keybinding}]`, e);
          }
        },
      });
    }

    console.debug(`Registered command ${command.id}`);
    return () => {
      unsubKb?.();
      this.commands.delete(command.id);
      console.debug(`Unregistered command ${command.id}`);
    };
  }

  get(id: string): AffineCommand | undefined {
    if (!this.commands.has(id)) {
      console.warn(`Command ${id} not registered.`);
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

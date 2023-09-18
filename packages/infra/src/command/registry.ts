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
      throw new Error(`Command ${options.id} already registered.`);
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

    return () => {
      unsubKb?.();
      this.commands.delete(command.id);
    };
  }

  get(id: string): AffineCommand | undefined {
    return this.commands.get(id);
  }

  getAll(): IterableIterator<AffineCommand> {
    return this.commands.values();
  }
})();

export function registerAffineCommand(options: AffineCommandOptions) {
  return AffineCommandRegistry.register(options);
}

import type { ReactNode } from 'react';

// TODO(@Peng): need better way for composing different precondition strategies
export enum PreconditionStrategy {
  Always,
  InPaperOrEdgeless,
  InPaper,
  InEdgeless,
  InEdgelessPresentationMode,
  NoSearchResult,
  Never,
}

export type CommandCategory =
  | 'editor:insert-object'
  | 'editor:page'
  | 'editor:edgeless'
  | 'affine:recent'
  | 'affine:pages'
  | 'affine:edgeless'
  | 'affine:collections'
  | 'affine:navigation'
  | 'affine:creation'
  | 'affine:settings'
  | 'affine:layout'
  | 'affine:updates'
  | 'affine:help'
  | 'affine:general'
  | 'affine:results';

export interface KeybindingOptions {
  binding: string;
  capture?: boolean;
  // some keybindings are already registered in blocksuite
  // we can skip the registration of these keybindings __FOR NOW__
  skipRegister?: boolean;
}

export interface AffineCommandOptions {
  id: string;
  // a set of predefined precondition strategies, but also allow user to customize their own
  // note: this only controls the visibility of the command, not the availability (e.g., shortcut keybinding still works)
  preconditionStrategy?: PreconditionStrategy | (() => boolean);
  // main text on the left..
  // make text a function so that we can do i18n and interpolation when we need to
  label:
    | string
    | (() => string)
    | {
        title: string;
        subTitle?: string;
      }
    | (() => {
        title: string;
        subTitle?: string;
      });
  icon: ReactNode; // TODO(@JimmFly): need a mapping from string -> React element/SVG
  category?: CommandCategory;
  // we use https://github.com/jamiebuilds/tinykeys so that we can use the same keybinding definition
  // for both mac and windows
  keyBinding?: KeybindingOptions | string;
  run: () => void | Promise<void>;
}

export interface AffineCommand {
  readonly id: string;
  readonly preconditionStrategy: PreconditionStrategy | (() => boolean);
  readonly label: {
    title: string;
    subTitle?: string;
  };
  readonly icon?: ReactNode; // icon name
  readonly category: CommandCategory;
  readonly keyBinding?: KeybindingOptions;
  run(): void | Promise<void>;
}

export function createAffineCommand(
  options: AffineCommandOptions
): AffineCommand {
  return {
    id: options.id,
    run: options.run,
    icon: options.icon,
    preconditionStrategy:
      options.preconditionStrategy ?? PreconditionStrategy.Always,
    category: options.category ?? 'affine:general',
    get label() {
      let label = options.label;
      label = typeof label === 'function' ? label?.() : label;
      label =
        typeof label === 'string'
          ? {
              title: label,
            }
          : label;
      return label;
    },
    keyBinding:
      typeof options.keyBinding === 'string'
        ? { binding: options.keyBinding }
        : options.keyBinding,
  };
}

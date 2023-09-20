// TODO: need better way for composing different precondition strategies
export enum PreconditionStrategy {
  Always,
  InPaperOrEdgeless,
  InPaper,
  InEdgeless,
  InEdgelessPresentationMode,
  NoSearchResult,
}

export type CommandCategory =
  | 'editor:insert-object'
  | 'editor:page'
  | 'editor:edgeless'
  | 'affine:recent'
  | 'affine:pages'
  | 'affine:navigation'
  | 'affine:creation'
  | 'affine:settings'
  | 'affine:layout'
  | 'affine:help'
  | 'affine:general';

export interface KeybindingOptions {
  binding: string;
  // some keybindings are already registered in blocksuite
  // we can skip the registration of these keybindings __FOR NOW__
  skipRegister?: boolean;
}

export interface AffineCommandOptions {
  id: string;
  // a set of predefined precondition strategies, but also allow user to customize their own
  preconditionStrategy?: PreconditionStrategy | (() => boolean);
  // main text on the left. If it is null, we will hide this command in the command palette.
  // make text a function so that we can do i18n and interpolation when we need to
  label?: string | (() => string);
  icon?: React.ReactNode; // todo: need a mapping from string -> React element/SVG
  category?: CommandCategory;
  // we use https://github.com/jamiebuilds/tinykeys so that we can use the same keybinding definition
  // for both mac and windows
  // todo: render keybinding in command palette
  keyBinding?: KeybindingOptions | string;
  run: () => void | Promise<void>;
}

export interface AffineCommand {
  readonly id: string;
  readonly preconditionStrategy: PreconditionStrategy | (() => boolean);
  readonly label?: string;
  readonly icon?: React.ReactNode; // icon name
  readonly category: CommandCategory;
  readonly keyBinding?: KeybindingOptions;
  run(e: Event): void | Promise<void>;
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
      const label = options.label;
      return typeof label === 'string' ? label : label?.();
    },
    keyBinding:
      typeof options.keyBinding === 'string'
        ? { binding: options.keyBinding }
        : options.keyBinding,
  };
}

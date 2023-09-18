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
  | 'affine:navigation'
  | 'affine:creation'
  | 'affine:ui'
  | 'affine:layout'
  | 'affine:help';

export interface KeybindingOptions {
  binding: string;
  // some keybindings are already registered in blocksuite
  // we can skip the registration of these keybindings __FOR NOW__
  skipRegister?: boolean;
}

export interface AffineCommandOptions {
  id: string;
  preconditionStrategy?: PreconditionStrategy;
  description?: string; // todo: i18n & interpolation
  icon?: string;
  category?: CommandCategory;
  // we use https://github.com/jamiebuilds/tinykeys so that we can use the same keybinding definition
  // for both mac and windows
  keyBinding?: KeybindingOptions | string;
  run: () => void | Promise<void>;
}

export interface AffineCommand {
  readonly id: string;
  readonly preconditionStrategy: PreconditionStrategy;
  readonly description?: string;
  readonly icon?: string; // icon name
  readonly category?: CommandCategory;
  readonly keyBinding?: KeybindingOptions;
  run(): void | Promise<void>;
}

export function createAffineCommand(
  options: AffineCommandOptions
): AffineCommand {
  return {
    ...options,
    preconditionStrategy:
      options.preconditionStrategy ?? PreconditionStrategy.Always,
    keyBinding:
      typeof options.keyBinding === 'string'
        ? { binding: options.keyBinding }
        : options.keyBinding,
  };
}

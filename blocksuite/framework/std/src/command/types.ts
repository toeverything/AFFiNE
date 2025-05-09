// type A = {};
// type B = { prop?: string };
// type C = { prop: string };
// type TestA = MakeOptionalIfEmpty<A>;  // void | {}
// type TestB = MakeOptionalIfEmpty<B>;  // void | { prop?: string }
// type TestC = MakeOptionalIfEmpty<C>;  // { prop: string }
import type { BlockStdScope } from '../scope/std-scope.js';
import type { cmdSymbol } from './consts.js';

export interface InitCommandCtx {
  std: BlockStdScope;
}

export type Cmds = {
  [cmdSymbol]: Command[];
};

export type Command<Input = InitCommandCtx, Output = {}> = (
  input: Input & InitCommandCtx,
  next: (output?: Output) => void
) => void;

export type Chain<CommandCtx extends object = InitCommandCtx> = {
  [cmdSymbol]: Command[];
  with: <Out extends object>(input: Out) => Chain<CommandCtx & Out>;
  pipe: {
    <Out extends object>(
      command: Command<CommandCtx, Out>
    ): Chain<CommandCtx & Out>;
    <Out extends object, In extends object>(
      command: Command<In, Out>,
      input?: In
    ): Chain<CommandCtx & In & Out>;
  };
  try: <Out extends object>(
    commands: (chain: Chain<CommandCtx>) => Chain<CommandCtx & Out>[]
  ) => Chain<CommandCtx & Out>;
  tryAll: <Out extends object>(
    commands: (chain: Chain<CommandCtx>) => Chain<CommandCtx & Out>[]
  ) => Chain<CommandCtx & Out>;
  run: () => [false, Partial<CommandCtx> & InitCommandCtx] | [true, CommandCtx];
};

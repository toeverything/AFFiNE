import { LifeCycleWatcher } from '../extension/index.js';
import { cmdSymbol } from './consts.js';
import type { Chain, Command, InitCommandCtx } from './types.js';

/**
 * Command manager to manage all commands
 *
 * Commands are functions that take a context and a next function as arguments
 *
 * ```ts
 * const myCommand: Command<input, output> = (ctx, next) => {
 *  const count = ctx.count || 0;
 *
 *  const success = someOperation();
 *  if (success) {
 *    return next({ count: count + 1 });
 *  }
 *  // if the command is not successful, you can return without calling next
 *  return;
 * ```
 *
 * Command input and output data can be defined in the `Command` type
 *
 * ```ts
 * // input: ctx.firstName, ctx.lastName
 * // output: ctx.fullName
 * const myCommand: Command<{ firstName: string; lastName: string }, { fullName: string }> = (ctx, next) => {
 *   const { firstName, lastName } = ctx;
 *   const fullName = `${firstName} ${lastName}`;
 *   return next({ fullName });
 * }
 *
 * ```
 *
 *
 * ---
 *
 * Commands can be run in two ways:
 *
 * 1. Using `exec` method
 * `exec` is used to run a single command
 * ```ts
 * const [result, data] = commandManager.exec(myCommand, payload);
 * ```
 *
 * 2. Using `chain` method
 * `chain` is used to run a series of commands
 * ```ts
 * const chain = commandManager.chain();
 * const [result, data] = chain
 *   .pipe(myCommand1)
 *   .pipe(myCommand2, payload)
 *   .run();
 * ```
 *
 * ---
 *
 * Command chains will stop running if a command is not successful
 *
 * ```ts
 * const chain = commandManager.chain();
 * const [result, data] = chain
 *   .chain(myCommand1) <-- if this fail
 *   .chain(myCommand2, payload) <- this won't run
 *   .run();
 *
 * result <- result will be `false`
 * ```
 *
 * You can use `try` to run a series of commands and if one of them is successful, it will continue to the next command
 * ```ts
 * const chain = commandManager.chain();
 * const [result, data] = chain
 *   .try(chain => [
 *     chain.pipe(myCommand1), <- if this fail
 *     chain.pipe(myCommand2, payload), <- this will run, if this success
 *     chain.pipe(myCommand3), <- this won't run
 *   ])
 *   .run();
 * ```
 *
 * The `tryAll` method is similar to `try`, but it will run all commands even if one of them is successful
 * ```ts
 * const chain = commandManager.chain();
 * const [result, data] = chain
 *   .try(chain => [
 *     chain.pipe(myCommand1), <- if this success
 *     chain.pipe(myCommand2), <- this will also run
 *     chain.pipe(myCommand3), <- so will this
 *   ])
 *   .run();
 * ```
 *
 */
export class CommandManager extends LifeCycleWatcher {
  static override readonly key = 'commandManager';

  private readonly _createChain = (_cmds: Command[]): Chain => {
    const getCommandCtx = this._getCommandCtx;
    const createChain = this._createChain;
    const chain = this.chain;

    return {
      [cmdSymbol]: _cmds,
      run: function (this: Chain) {
        let ctx = getCommandCtx();
        let success = false;
        try {
          const cmds = this[cmdSymbol];
          ctx = runCmds(ctx, [
            ...cmds,
            (_, next) => {
              success = true;
              next();
            },
          ]);
        } catch (err) {
          console.error(err);
        }

        return [success, ctx];
      },
      with: function (this: Chain, value) {
        const cmds = this[cmdSymbol];
        return createChain([...cmds, (_, next) => next(value)]) as never;
      },
      pipe: function (this: Chain, command: Command, input?: object) {
        const cmds = this[cmdSymbol];
        return createChain([
          ...cmds,
          (ctx, next) => command({ ...ctx, ...input }, next),
        ]);
      },
      try: function (this: Chain, fn) {
        const cmds = this[cmdSymbol];
        return createChain([
          ...cmds,
          (beforeCtx, next) => {
            let ctx = beforeCtx;

            const commands = fn(chain());

            commands.some(innerChain => {
              innerChain[cmdSymbol] = [
                (_, next) => {
                  next(ctx);
                },
                ...innerChain[cmdSymbol],
              ];

              const [success, branchCtx] = innerChain.run();
              ctx = { ...ctx, ...branchCtx };

              if (success) {
                next(ctx);
                return true;
              }
              return false;
            });
          },
        ]) as never;
      },
      tryAll: function (this: Chain, fn) {
        const cmds = this[cmdSymbol];
        return createChain([
          ...cmds,
          (beforeCtx, next) => {
            let ctx = beforeCtx;

            let allFail = true;

            const commands = fn(chain());

            commands.forEach(innerChain => {
              innerChain[cmdSymbol] = [
                (_, next) => {
                  next(ctx);
                },
                ...innerChain[cmdSymbol],
              ];

              const [success, branchCtx] = innerChain.run();
              ctx = { ...ctx, ...branchCtx };

              if (success) {
                allFail = false;
              }
            });

            if (!allFail) {
              next(ctx);
            }
          },
        ]) as never;
      },
    };
  };

  private readonly _getCommandCtx = (): InitCommandCtx => {
    return {
      std: this.std,
    };
  };

  /**
   * Create a chain to run a series of commands
   * ```ts
   * const chain = commandManager.chain();
   * const [result, data] = chain
   *   .myCommand1()
   *   .myCommand2(payload)
   *   .run();
   * ```
   * @returns [success, data] - success is a boolean to indicate if the chain is successful,
   *   data is the final context after running the chain
   */
  chain = (): Chain<InitCommandCtx> => {
    return this._createChain([]);
  };

  exec = <Output extends object, Input extends object>(
    command: Command<Input, Output>,
    input?: Input
  ) => {
    return this.chain().pipe(command, input).run();
  };
}

function runCmds(ctx: InitCommandCtx, [cmd, ...rest]: Command[]) {
  let _ctx = ctx;
  if (cmd) {
    cmd(ctx, data => {
      _ctx = runCmds({ ...ctx, ...data }, rest);
    });
  }
  return _ctx;
}

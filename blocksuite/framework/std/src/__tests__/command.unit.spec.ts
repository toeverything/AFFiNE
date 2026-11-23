import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Command } from '../command/index.js';
import { CommandManager } from '../command/index.js';
import type { BlockStdScope } from '../scope/std-scope.js';

type Command1 = Command<
  {
    command1Option?: string;
  },
  {
    commandData1: string;
  }
>;

type Command2 = Command<{ commandData1: string }, { commandData2: string }>;

describe('CommandManager', () => {
  let std: BlockStdScope;
  let commandManager: CommandManager;

  beforeEach(() => {
    // @ts-expect-error FIXME: ts error
    std = {};
    commandManager = new CommandManager(std);
  });

  test('can add and execute a command', () => {
    const command1: Command1 = vi.fn((_ctx, next) => next());
    const command2: Command2 = vi.fn((_ctx, _next) => {});

    const [success1] = commandManager.chain().pipe(command1, {}).run();
    const [success2] = commandManager
      .chain()
      .pipe(command1, {})
      .pipe(command2)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(success1).toBeTruthy();
    expect(success2).toBeFalsy();
  });

  test('can chain multiple commands', () => {
    const command1: Command = vi.fn((_ctx, next) => next());
    const command2: Command = vi.fn((_ctx, next) => next());
    const command3: Command = vi.fn((_ctx, next) => next());

    const [success] = commandManager
      .chain()
      .pipe(command1)
      .pipe(command2)
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(success).toBeTruthy();
  });

  test('skip commands if there is a command failed before them (`next` not executed)', () => {
    const command1: Command = vi.fn((_ctx, next) => next());
    const command2: Command = vi.fn((_ctx, _next) => {});
    const command3: Command = vi.fn((_ctx, next) => next());

    const [success] = commandManager
      .chain()
      .pipe(command1)
      .pipe(command2)
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).not.toHaveBeenCalled();
    expect(success).toBeFalsy();
  });

  test('can handle command failure', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const command1: Command = vi.fn((_ctx, next) => next());
    const command2: Command = vi.fn((_ctx, _next) => {
      throw new Error('command2 failed');
    });
    const command3: Command = vi.fn((_ctx, next) => next());

    const [success] = commandManager
      .chain()
      .pipe(command1)
      .pipe(command2)
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).not.toHaveBeenCalled();
    expect(success).toBeFalsy();
    expect(errorSpy).toHaveBeenCalledWith(new Error('command2 failed'));
  });

  test('can pass data to command when calling a command', () => {
    const command1: Command1 = vi.fn((_ctx, next) => next());

    const [success] = commandManager
      .chain()
      .pipe(command1, { command1Option: 'test' })
      .run();

    expect(command1).toHaveBeenCalledWith(
      expect.objectContaining({ command1Option: 'test' }),
      expect.any(Function)
    );
    expect(success).toBeTruthy();
  });

  test('can add data to the command chain with `with` method', () => {
    const command1: Command<{ commandData1: string }> = vi.fn((_ctx, next) =>
      next()
    );

    const [success, ctx] = commandManager
      .chain()
      .with({ commandData1: 'test' })
      .pipe(command1)
      .run();

    expect(command1).toHaveBeenCalledWith(
      expect.objectContaining({ commandData1: 'test' }),
      expect.any(Function)
    );
    expect(success).toBeTruthy();
    expect(ctx.commandData1).toBe('test');
  });

  test('passes and updates context across commands', () => {
    const command1: Command<{}, { commandData1: string }> = vi.fn(
      (_ctx, next) => next({ commandData1: '123' })
    );
    const command2: Command<{ commandData1: string }> = vi.fn((ctx, next) => {
      expect(ctx.commandData1).toBe('123');
      next({ commandData1: '456' });
    });

    const [success, ctx] = commandManager
      .chain()
      .pipe(command1)
      .pipe(command2)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(success).toBeTruthy();
    expect(ctx.commandData1).toBe('456');
  });

  test('should not continue with the rest of the chain if all commands in `try` fail', () => {
    const command1: Command = vi.fn((_ctx, _next) => {});
    const command2: Command = vi.fn((_ctx, _next) => {});
    const command3: Command = vi.fn((_ctx, next) => next());

    const [success] = commandManager
      .chain()
      .try(chain => [chain.pipe(command1), chain.pipe(command2)])
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).not.toHaveBeenCalled();
    expect(success).toBeFalsy();
  });

  test('should not re-execute previous commands in the chain before `try`', () => {
    const command1: Command<{}, { commandData1: string }> = vi.fn(
      (_ctx, next) => next({ commandData1: '123' })
    );
    const command2: Command = vi.fn((_ctx, _next) => {});
    const command3: Command = vi.fn((_ctx, next) => next());

    const [success, ctx] = commandManager
      .chain()
      .pipe(command1)
      .try(chain => [chain.pipe(command2), chain.pipe(command3)])
      .run();

    expect(command1).toHaveBeenCalledTimes(1);
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(success).toBeTruthy();
    expect(ctx.commandData1).toBe('123');
  });

  test('should continue with the rest of the chain if one command in `try` succeeds', () => {
    const command1: Command<
      {},
      { commandData1?: string; commandData2?: string }
    > = vi.fn((_ctx, _next) => {});
    const command2: Command<
      {},
      { commandData1?: string; commandData2?: string }
    > = vi.fn((_ctx, next) => next({ commandData2: '123' }));
    const command3: Command<{}, { commandData3: string }> = vi.fn(
      (_ctx, next) => next({ commandData3: '456' })
    );

    const [success, ctx] = commandManager
      .chain()
      .try(chain => [chain.pipe(command1), chain.pipe(command2)])
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(success).toBeTruthy();
    expect(ctx.commandData1).toBeUndefined();
    expect(ctx.commandData2).toBe('123');
    expect(ctx.commandData3).toBe('456');
  });

  test('should not execute any further commands in `try` after one succeeds', () => {
    const command1: Command<
      {},
      { commandData1?: string; commandData2?: string }
    > = vi.fn((_ctx, next) => next({ commandData1: '123' }));
    const command2: Command<
      {},
      { commandData1?: string; commandData2?: string }
    > = vi.fn((_ctx, next) => next({ commandData2: '456' }));

    const [success, ctx] = commandManager
      .chain()
      .try(chain => [chain.pipe(command1), chain.pipe(command2)])
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).not.toHaveBeenCalled();
    expect(success).toBeTruthy();
    expect(ctx.commandData1).toBe('123');
    expect(ctx.commandData2).toBeUndefined();
  });

  test('should pass context correctly in `try` when a command succeeds', () => {
    const command1: Command = vi.fn((_ctx, next) =>
      next({ commandData1: 'fromCommand1', commandData2: 'fromCommand1' })
    );
    const command2: Command = vi.fn((ctx, next) => {
      expect(ctx.commandData1).toBe('fromCommand1');
      expect(ctx.commandData2).toBe('fromCommand1');
      // override commandData2
      next({ commandData2: 'fromCommand2' });
    });
    const command3: Command = vi.fn((ctx, next) => {
      expect(ctx.commandData1).toBe('fromCommand1');
      expect(ctx.commandData2).toBe('fromCommand2');
      next();
    });

    const [success] = commandManager
      .chain()
      .pipe(command1)
      .try(chain => [chain.pipe(command2)])
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(success).toBeTruthy();
  });

  test('should continue with the rest of the chain if at least one command in `tryAll` succeeds', () => {
    const command1: Command = vi.fn((_ctx, _next) => {});
    const command2: Command = vi.fn((_ctx, next) => next());
    const command3: Command = vi.fn((_ctx, next) => next());

    const [success] = commandManager
      .chain()
      .tryAll(chain => [chain.pipe(command1), chain.pipe(command2)])
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(success).toBeTruthy();
  });

  test('should execute all commands in `tryAll` even if one has already succeeded', () => {
    const command1: Command<
      {},
      { commandData1?: string; commandData2?: string; commandData3?: string }
    > = vi.fn((_ctx, next) => next({ commandData1: '123' }));
    const command2: Command<
      {},
      { commandData1?: string; commandData2?: string; commandData3?: string }
    > = vi.fn((_ctx, next) => next({ commandData2: '456' }));
    const command3: Command<
      {},
      { commandData1?: string; commandData2?: string; commandData3?: string }
    > = vi.fn((_ctx, next) => next({ commandData3: '789' }));

    const [success, ctx] = commandManager
      .chain()
      .tryAll(chain => [
        chain.pipe(command1),
        chain.pipe(command2),
        chain.pipe(command3),
      ])
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(ctx.commandData1).toBe('123');
    expect(ctx.commandData2).toBe('456');
    expect(ctx.commandData3).toBe('789');
    expect(success).toBeTruthy();
  });

  test('should not continue with the rest of the chain if all commands in `tryAll` fail', () => {
    const command1: Command = vi.fn((_ctx, _next) => {});
    const command2: Command = vi.fn((_ctx, _next) => {});
    const command3: Command<{}, { commandData3: string }> = vi.fn(
      (_ctx, next) => next({ commandData3: '123' })
    );

    const [success, ctx] = commandManager
      .chain()
      .tryAll(chain => [chain.pipe(command1), chain.pipe(command2)])
      .pipe(command3)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).not.toHaveBeenCalled();
    expect(ctx.commandData3).toBeUndefined();
    expect(success).toBeFalsy();
  });

  test('should pass context correctly in `tryAll` when at least one command succeeds', () => {
    const command1: Command<{}, { commandData1: string }> = vi.fn(
      (_ctx, next) => next({ commandData1: 'fromCommand1' })
    );
    const command2: Command<
      { commandData1: string; commandData2?: string },
      { commandData2: string; commandData3: string }
    > = vi.fn((ctx, next) => {
      expect(ctx.commandData1).toBe('fromCommand1');
      // override commandData1
      next({ commandData1: 'fromCommand2', commandData2: 'fromCommand2' });
    });
    const command3: Command<
      { commandData1: string; commandData2?: string },
      { commandData2: string; commandData3: string }
    > = vi.fn((ctx, next) => {
      expect(ctx.commandData1).toBe('fromCommand2');
      expect(ctx.commandData2).toBe('fromCommand2');
      next({
        // override commandData2
        commandData2: 'fromCommand3',
        commandData3: 'fromCommand3',
      });
    });
    const command4: Command<
      { commandData1: string; commandData2: string; commandData3: string },
      {}
    > = vi.fn((ctx, next) => {
      expect(ctx.commandData1).toBe('fromCommand2');
      expect(ctx.commandData2).toBe('fromCommand3');
      expect(ctx.commandData3).toBe('fromCommand3');
      next();
    });

    const [success, ctx] = commandManager
      .chain()
      .pipe(command1)
      .tryAll(chain => [chain.pipe(command2), chain.pipe(command3)])
      .pipe(command4)
      .run();

    expect(command1).toHaveBeenCalled();
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(command4).toHaveBeenCalled();
    expect(success).toBeTruthy();
    expect(ctx.commandData1).toBe('fromCommand2');
    expect(ctx.commandData2).toBe('fromCommand3');
    expect(ctx.commandData3).toBe('fromCommand3');
  });

  test('should not re-execute commands before `tryAll` after executing `tryAll`', () => {
    const command1: Command = vi.fn((_ctx, next) => next());
    const command2: Command = vi.fn((_ctx, next) => next());
    const command3: Command = vi.fn((_ctx, _next) => {});
    const command4: Command = vi.fn((_ctx, next) => next());

    const [success] = commandManager
      .chain()
      .pipe(command1)
      .tryAll(chain => [chain.pipe(command2), chain.pipe(command3)])
      .pipe(command4)
      .run();

    expect(command1).toHaveBeenCalledTimes(1);
    expect(command2).toHaveBeenCalled();
    expect(command3).toHaveBeenCalled();
    expect(command4).toHaveBeenCalled();
    expect(success).toBeTruthy();
  });
});

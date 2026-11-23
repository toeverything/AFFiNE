# Command

Commands are the reusable actions for triggering state updates. Inside a command, you can query different states of the editor, or perform operations to update them. With the command API, you can define chainable commands and execute them.

## Command Chain

Commands are executed in a chain, and each command can decide whether to continue the chain or not.

```ts
std.command.chain().command1().command2().command3().run();
```

You will need to call `chain()` to start a new chain. Then, you can call any command defined in the `Commands` interface. And finally, call `run()` to execute the chain.

### Try

If a command fails, the chain will be interrupted. However, you can use `try()` to call a list of commands until one of them succeeds.

```ts
std.command
  .chain()
  .try(cmd => [cmd.command1(), cmd.command2()])
  .command3()
  .run();
```

In this chain, `command3` will be executed only if `command1` or `command2` succeeds. If `command1` succeeds, `command2` will not be executed.

### TryAll

`tryAll` is used to attempt to execute an array of commands within a chain. Unlike `try`, which stops executing the list of commands as soon as one of them succeeds, `tryAll` will execute every command in the array, regardless of the individual outcomes of each command.

This means that even if one of the commands succeeds, `tryAll` will still continue to execute the remaining commands in the array. The chain will only proceed to the next command after `tryAll` if at least one command in the array succeeds. If all commands fail, the chain will be interrupted.

```ts
std.command
  .chain()
  .tryAll(cmd => [cmd.command1(), cmd.command2(), cmd.command3()])
  .command4()
  .run();
```

If `command1`, `command2`, or `command3` succeeds, `command4` will be executed. If all commands in `tryAll` fail, the chain will stop, and `command4` will not be executed.

Use `tryAll` when you want to ensure that multiple strategies or operations are attempted, even if the success of one is enough to allow the chain to continue. This approach is useful when each command in the array should be given a chance to execute, regardless of the success of the others.

## Writing Commands

Commands are defined as pure functions.

```ts
import type { Command } from '@blocksuite/block-std';
export const myCommand: Command = (ctx, next) => {
  if (fail) {
    return;
  }

  return next();
};

declare global {
  namespace BlockSuite {
    interface Commands {
      my: typeof myCommand;
    }
  }
}

// Add the command to the std command list
std.command.add('my', myCommand);

// You can call it with
std.command.chain().my().run();
```

Only when the command calls `next()`, the next command in the chain will be executed.

## Command Context

When a list of commands are executed, they share a context object.
This object is standalone for each command execution, and you can use it to store temporary data.

```ts
import type { Command } from '@blocksuite/block-std';
export const myCommand: Command<never, 'myCommandData'> = (ctx, next) => {
  if (fail) {
    return;
  }

  return next({ myCommandData: 'hello' });
};

declare global {
  namespace BlockSuite {
    interface CommandContext {
      myCommandData: string;
    }

    interface Commands {
      myCommand: typeof myCommand;
    }
  }
}
```

Then, commands executed after `myCommand` can access the data:

```ts
export const myCommand: Command<'myCommandData'> = (ctx, next) => {
  const data = ctx.myCommandData;
  console.log(data);
};
```

## Command Options

You can pass options to a command when calling it:

```ts
import type { Command } from '@blocksuite/block-std';

type MyCommandOptions = {
  configA: number;
  configB: string;
};
export const myCommand: Command<never, never, MyCommandOptions> = (
  ctx,
  next
) => {
  const { configA, configB } = ctx;

  if (fail) {
    return;
  }

  return next();
};

// You can call it with
std.command.chain().my({ configA: 0, configB: 'hello' }).run();
```

Please notice that commands take only one argument,
so you need to wrap the options in an object if you want to pass multiple options.

## Inline Command

You can also use inline command for some temporary commands.

```ts
std.command
  .chain()
  .inline((ctx, next) => {
    // ...
    return next();
  })
  .run();
```

## Command Returns

After `.run`, the command chain will return two values: `success` and `ctx`.

```ts
const [success, ctx] = std.command.chain().commandA().commandB().run();
```

If all commands passed, the `success` will be `true`, otherwise it will be `false`.

The `ctx` will be the final `context` updated by `.next` in a command chain.

For example:

```ts
const command1 = (ctx, next) => {
  return next({ data: 0, str: 'hello' });
};

const command2 = (ctx, next) => {
  return next({ data: 1 });
};

const [success, ctx] = std.command.chain().command1().command2().run();

// This will pass
expect(ctx.data).toBe(1);

// This will pass too
expect(ctx.str).toBe('hello');
```

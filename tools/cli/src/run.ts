import { Path } from '@affine-tools/utils/path';
import { execAsync } from '@affine-tools/utils/process';
import type { Package, PackageName } from '@affine-tools/utils/workspace';

import { Option, PackageCommand } from './command';

interface RunScriptOptions {
  includeDependencies?: boolean;
  waitDependencies?: boolean;
  ignoreIfNotFound?: boolean;
}

const currentDir = Path.dir(import.meta.url);

const ignoreLoaderScripts = [
  'vitest',
  'vite',
  'ts-node',
  'prisma',
  'cap',
  'tsc',
  'typedoc',
  /^r$/,
  /electron(?!-)/,
];

export class RunCommand extends PackageCommand {
  static override paths = [[], ['run'], ['r']];

  static override usage = PackageCommand.Usage({
    description: 'AFFiNE Monorepo scripts',
    details: `
      \`affine web <script>\`    Run any script defined in package's package.json

      \`affine init\`            Generate the required files if there are any package added or removed

      \`affine clean\`           Clean the output files of ts, cargo, webpack, etc.

      \`affine bundle\`          Bundle the packages

      \`affine build\`           A proxy for <-p package>'s \`build\` script

      \`affine dev\`             A proxy for <-p package>'s \`dev\` script
    `,
    examples: [
      [`See detail of each command`, '$0 -h'],
      [
        `Run custom 'xxx' script defined in @affine/web's package.json`,
        '$0 web xxx',
      ],
      [`Run 'init' for workspace`, '$0 init'],
      [`Clean dist of each package`, '$0 clean --dist'],
      [`Clean node_modules under each package`, '$0 clean --node-modules'],
      [`Clean everything`, '$0 clean --all'],
      [`Run 'build' script for @affine/web`, '$0 build -p web'],
      [
        `Run 'build' script for @affine/web with all deps prebuild before`,
        '$0 build -p web --deps',
      ],
    ],
  });

  // we use positional arguments instead of options
  protected override packageNameOrAlias: string = Option.String({
    required: true,
    validator: this.packageNameValidator,
  });

  args = Option.Proxy({ name: 'args', required: 1 });

  async execute() {
    await this.run(this.package, this.args, {
      includeDependencies: this.deps,
      waitDependencies: this.waitDeps,
    });
  }

  async run(name: PackageName, args: string[], opts: RunScriptOptions = {}) {
    opts = {
      includeDependencies: false,
      waitDependencies: true,
      ignoreIfNotFound: false,
      ...opts,
    };

    const pkg = this.workspace.getPackage(name);
    const scriptName = args[0];
    const pkgScript = pkg.scripts[scriptName];

    if (pkgScript) {
      await this.runScript(pkg, scriptName, args.slice(1), opts);
    } else {
      await this.runCommand(pkg, args);
    }
  }

  async runScript(
    pkg: Package,
    scriptName: string,
    args: string[],
    opts: RunScriptOptions = {}
  ) {
    const rawScript = pkg.scripts[scriptName];

    if (!rawScript) {
      if (opts.ignoreIfNotFound) {
        return;
      }

      throw new Error(`Script ${scriptName} not found in ${pkg.name}`);
    }

    const rawArgs = [...rawScript.split(' '), ...args];

    const { args: extractedArgs, envs } = this.extractEnvs(rawArgs);

    args = extractedArgs;

    if (opts.includeDependencies) {
      const depsRun = Promise.all(
        pkg.deps.map(dep => {
          return this.runScript(
            pkg.workspace.getPackage(dep.name),
            scriptName,
            [],
            {
              ...opts,
              ignoreIfNotFound: true,
            }
          );
        })
      );

      if (opts.waitDependencies) {
        await depsRun;
      } else {
        depsRun.catch(e => {
          this.logger.error(e);
        });
      }
    }

    const isAFFiNECommand = args[0] === 'affine';
    if (isAFFiNECommand) {
      // remove 'affine' from 'affine xxx' command
      args.shift();
      args.push('-p', pkg.name);

      process.env = {
        ...process.env,
        ...envs,
      };
      await this.cli.run(args);
    } else {
      await this.runCommand(pkg, rawArgs);
    }
  }

  async runCommand(pkg: Package, args: string[]) {
    const { args: extractedArgs, envs } = this.extractEnvs(args);
    args = extractedArgs;

    const bin = args[0] === 'yarn' ? args[1] : args[0];

    const loader = currentDir.join('../register.js').toFileUrl().toString();

    // very simple test for auto ts/mjs scripts
    const isLoaderRequired =
      !ignoreLoaderScripts.some(ignore => new RegExp(ignore).test(bin)) ||
      process.env.NODE_OPTIONS?.includes('ts-node/esm') ||
      process.env.NODE_OPTIONS?.includes(loader);

    let NODE_OPTIONS = process.env.NODE_OPTIONS
      ? [process.env.NODE_OPTIONS]
      : [];

    if (isLoaderRequired) {
      NODE_OPTIONS.push(`--import=${loader}`);
    }

    if (args[0] !== 'yarn') {
      // add 'yarn' to the command so we can bypass bin execution to it
      args.unshift('yarn');
    }

    await execAsync(pkg.name, args, {
      cwd: pkg.path.value,
      env: {
        ...envs,
        NODE_OPTIONS: NODE_OPTIONS.join(' '),
      },
    });
  }

  private extractEnvs(args: string[]): {
    args: string[];
    envs: Record<string, string>;
  } {
    const envs: Record<string, string> = {};

    let i = 0;

    while (i < args.length) {
      const arg = args[i];
      if (arg === 'cross-env') {
        i++;
        continue;
      }

      const match = arg.match(/^([A-Z_]+)=(.+)$/);

      if (match) {
        envs[match[1]] = match[2];
        i++;
      } else {
        // not envs any more
        break;
      }
    }

    return {
      args: args.slice(i),
      envs,
    };
  }
}

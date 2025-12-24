import { AliasToPackage } from '@affine-tools/utils/distribution';
import { Logger } from '@affine-tools/utils/logger';
import { exec, execAsync, spawn } from '@affine-tools/utils/process';
import { type PackageName, Workspace } from '@affine-tools/utils/workspace';
import { Command as BaseCommand, Option } from 'clipanion';
import inquirer from 'inquirer';
import * as t from 'typanion';

import type { CliContext } from './context';

export abstract class Command extends BaseCommand<CliContext> {
  // @ts-expect-error hack: Get the command name
  cmd = this.constructor.paths[0][0];

  get logger() {
    return new Logger(this.cmd);
  }

  get workspace() {
    return this.context.workspace;
  }

  set workspace(workspace: Workspace) {
    this.context.workspace = workspace;
  }

  exec = exec.bind(null, this.cmd);
  execAsync = execAsync.bind(null, this.cmd);
  spawn = spawn.bind(null, this.cmd);
}

export abstract class PackageCommand extends Command {
  protected availablePackageNameArgs = (
    Workspace.PackageNames as string[]
  ).concat(Array.from(AliasToPackage.keys()));
  protected packageNameValidator = t.isOneOf(
    this.availablePackageNameArgs.map(k => t.isLiteral(k))
  );

  protected packageNameOrAlias = Option.String('--package,-p', {
    required: true,
    validator: this.packageNameValidator,
    description: 'The package name or alias to be run with',
  });

  get package(): PackageName {
    const name =
      AliasToPackage.get(this.packageNameOrAlias as any) ??
      (this.packageNameOrAlias as PackageName);

    // check
    this.workspace.getPackage(name);

    return name;
  }

  protected _deps = Option.Boolean('--deps', false, {
    description:
      'Execute the same command in workspace dependencies, if defined.',
  });

  get deps() {
    return this._deps;
  }

  waitDeps = Option.Boolean('--wait-deps', false, {
    description: 'Wait for dependencies to be ready before running the command',
  });
}

export abstract class PackagesCommand extends Command {
  protected availablePackageNameArgs = (
    Workspace.PackageNames as string[]
  ).concat(Array.from(AliasToPackage.keys()));
  protected packageNameValidator = t.isOneOf(
    this.availablePackageNameArgs.map(k => t.isLiteral(k))
  );

  protected packageNamesOrAliases = Option.Array('--package,-p', {
    required: true,
    validator: t.isArray(this.packageNameValidator),
  });
  get packages() {
    return this.packageNamesOrAliases.map(
      name => AliasToPackage.get(name as any) ?? name
    );
  }

  deps = Option.Boolean('--deps', false, {
    description:
      'Execute the same command in workspace dependencies, if defined.',
  });
}

export abstract class PackageSelectorCommand extends Command {
  protected availablePackages = Workspace.PackageNames;

  protected availablePackageNameArgs = (
    Workspace.PackageNames as string[]
  ).concat(Array.from(AliasToPackage.keys()));

  protected packageNameValidator = t.isOneOf(
    this.availablePackageNameArgs.map(k => t.isLiteral(k))
  );

  protected packageNameOrAlias = Option.String('--package,-p', {
    validator: this.packageNameValidator,
    description: 'The package name or alias to be run with',
  });

  async getPackage(): Promise<PackageName> {
    let name = this.packageNameOrAlias
      ? (AliasToPackage.get(this.packageNameOrAlias as any) ??
        this.packageNameOrAlias)
      : undefined;

    if (!name) {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'package',
          message: 'Which package do you want to dev?',
          choices: this.availablePackages.map(name => ({
            name,
            value: name,
          })),
          pageSize: 10,
          default: '@affine/web',
        },
      ]);

      name = answer.package as PackageName;
    }

    // check
    this.workspace.getPackage(name as PackageName);

    return name as PackageName;
  }
}

export { Option };

import { Type } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export abstract class Mocker<In, Out> {
  // NOTE(@forehalo):
  //   The reason why we don't inject [Models] to Mocker for more easier data creation with built in logic is,
  //   the method in [Models] may introduce side effects like 'events',
  //   which may break the tests with event emitting asserts.
  protected db!: PrismaClient;

  abstract create(input?: Partial<In>): Promise<Out>;
}

type MockerConstructor<In, Out> = Type<Mocker<In, Out>>;
type MockerInput<Ctor extends MockerConstructor<any, any>> =
  Ctor extends MockerConstructor<infer In, any> ? In : never;
type MockerOutput<Ctor extends MockerConstructor<any, any>> =
  Ctor extends MockerConstructor<any, infer Out> ? Out : never;

const FACTORIES = new Map<string, Mocker<any, any>>();

interface FactoryOptions {
  logger: ((val: any) => void) | boolean;
}

export function createFactory(
  db: PrismaClient,
  opts: FactoryOptions = { logger: false }
) {
  const log = (val: any) => {
    if (typeof opts.logger === 'function') {
      opts.logger(val);
    } else if (opts.logger) {
      console.log(val);
    }
  };

  class Inner {
    static create<Ctor extends MockerConstructor<any, any>>(
      Factory: Ctor,
      overrides?: Partial<MockerInput<Ctor>>
    ): Promise<MockerOutput<Ctor>>;
    static create<Ctor extends MockerConstructor<any, any>>(
      Factory: Ctor,
      count: number
    ): Promise<MockerOutput<Ctor>[]>;
    static create<Ctor extends MockerConstructor<any, any>>(
      Factory: Ctor,
      overrides: Partial<MockerInput<Ctor>>,
      count: number
    ): Promise<MockerOutput<Ctor>[]>;
    static async create<Ctor extends MockerConstructor<any, any>>(
      Factory: Ctor,
      overridesOrCount?: Partial<MockerInput<Ctor>> | number,
      count?: number
    ): Promise<MockerOutput<Ctor> | MockerOutput<Ctor>[]> {
      let factory = FACTORIES.get(Factory.name);

      if (!factory) {
        factory = new Factory();
        // @ts-expect-error private
        factory.db = db;
        FACTORIES.set(Factory.name, factory);
      }

      let overrides: Partial<MockerInput<Ctor>> | undefined = undefined;
      if (typeof overridesOrCount === 'number') {
        count = overridesOrCount;
      } else {
        overrides = overridesOrCount;
      }

      if (typeof count === 'number') {
        return await Promise.all(
          Array.from({ length: count }).map(async () => {
            const row = await factory.create(overrides);
            log(row);
            return row;
          })
        );
      }

      const row = await factory.create(overrides);
      log(row);
      return row;
    }
  }

  return Inner.create;
}

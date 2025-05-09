import '../prelude';

import { PrismaClient } from '@prisma/client';

import { createFactory, Mockers } from '../__tests__/mocks';

const client = new PrismaClient();

const args = process.argv.slice(2);

if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.log(`
seed [Entity] [count] [[field]=[val]]

Checkout [server/src/__tests__/mocks/*.mock.ts] for all available Entities and Inputs

examples:

$ seed User                                  Create an User
$ seed User 3                                Create 3 Users
$ seed User feature=pro_plan_v1              Create an User with Pro feature
$ seed TeamWorkspace id=xxx                  Seed a workspace with Team feature
$ seed Workspace id=xxx public=true          Seed with boolean property
$ seed TeamWorkspace id=xxx quantity=10n     Seed with numberic property, use \`={num}n\` suffix
`);
  process.exit(0);
}

const name = args.shift() as keyof typeof Mockers;
const Mocker = Mockers[name];

if (!name || !Mocker) {
  throw new Error(
    'First argument must be one of: ' + JSON.stringify(Object.keys(Mockers))
  );
}

const create = createFactory(client, {
  logger: (val: any) => {
    console.log(`${name} ${JSON.stringify(val)}`);
  },
});

function parseArgs(args: string[]) {
  if (!args.length) {
    return { count: 1 };
  }

  const overrides: Record<string, any> = {};
  let count: number = 1;

  args.forEach(arg => {
    let kvSep = arg.indexOf('=');
    if (kvSep) {
      const key = arg.slice(0, kvSep);
      const val = arg.slice(kvSep + 1);

      if (/[\d]+n$/.test(val)) {
        const num = Number(val.slice(0, -1));
        if (Number.isNaN(num)) {
          throw new Error(`Invalid numeric parameter: ${arg}`);
        }
        overrides[key] = num;
      } else if (val.length === 4 && val.toLowerCase() === 'true') {
        overrides[key] = true;
      } else if (val.length === 5 && val.toLowerCase() === 'false') {
        overrides[key] = false;
      } else {
        overrides[key] = val;
      }
    } else {
      const maybeCount = parseInt(arg);
      if (!maybeCount || Number.isNaN(maybeCount)) {
        console.warn(`Invalid parameter: ${arg}`);
        return;
      }
      count = maybeCount;
    }
  });

  return {
    overrides,
    count,
  };
}

const { overrides, count } = parseArgs(args);
await create(Mocker, overrides as any, count);

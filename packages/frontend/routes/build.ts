import fs from 'node:fs';
import { join } from 'node:path/posix';

import { Path, prettier } from '@affine-tools/utils';
import { parse } from 'path-to-regexp';

const curdir = Path.dir(import.meta.url);

const inputFile = curdir.join('routes.json').value;
const routerOutputFile = curdir.join('src', 'routes.ts').value;

interface RawRoutesSchema {
  route: string;
  children: {
    [key: string]: string | RawRoutesSchema;
  };
}

interface RouteSchema {
  name: string;
  fromParent: string;
  fromRoot: string;
  children: Array<RouteSchema>;
}

function loadRoutesSchema(): RouteSchema {
  const rawSchema = JSON.parse(
    fs.readFileSync(inputFile, 'utf-8')
  ) as RawRoutesSchema;

  const build = (
    name: string,
    schema: RawRoutesSchema | string,
    fromRoot: string = ''
  ): RouteSchema => {
    if (typeof schema === 'string') {
      return {
        name,
        fromParent: schema,
        fromRoot: join(fromRoot, schema),
        children: [],
      };
    }

    const absolute = join(fromRoot, schema.route);
    return {
      name,
      fromParent: schema.route,
      fromRoot: absolute,
      children: Object.entries(schema.children).map(([key, value]) => {
        return build(key, value, absolute);
      }),
    };
  };

  return build('home', rawSchema);
}

interface BuiltRouteSchema {
  name: string;
  type?: string;
  factory: string;
  fromRoot: string;
  fromParent: string;
  children: BuiltRouteSchema[];
  parent: BuiltRouteSchema | null;
}

function buildRoutes(
  schema: RouteSchema,
  parent: BuiltRouteSchema | null = null
): BuiltRouteSchema {
  const { tokens } = parse(schema.fromRoot);

  const types: string[] = [];
  const factories: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'param':
      case 'wildcard':
        types.push(token.name);
        factories.push(`\${params.${token.name}}`);
        break;
      case 'text': {
        factories.push(token.value);
        break;
      }
    }
  }

  // [a, b, c] -> '{ a: string; b: string; c: string }'
  const type = types.length
    ? `{ ${types.map(type => `${type}: string`).join('; ')} }`
    : undefined;

  const builtResult: BuiltRouteSchema = {
    name: schema.name,
    type,
    factory: factories.join(''),
    fromRoot: schema.fromRoot,
    fromParent: schema.fromParent,
    parent: parent,
    children: [],
  };

  builtResult.children = schema.children.map(child =>
    buildRoutes(child, builtResult)
  );

  return builtResult;
}

function printSchemaTypes(schema: BuiltRouteSchema, level: number = 1): string {
  const types: string[] = [];

  if (schema.type) {
    if (schema.children.length) {
      types.push(`index: ${schema.type};`);
    } else {
      return schema.type;
    }
  }

  for (const child of schema.children) {
    const childType = printSchemaTypes(child, level + 1);
    if (childType) {
      types.push(`${child.name}: ${childType};`);
    }
  }

  if (types.length > 0) {
    const output = `{ ${types.join('\n')} }`;
    return level === 1 ? `export interface RouteParamsTypes ${output}` : output;
  }

  return '';
}

function printAbsolutePaths(schema: BuiltRouteSchema, level = 1): string {
  const absolutes: string[] = [];

  if (schema.children.length) {
    absolutes.push(`index: '${schema.fromRoot}'`);
  } else {
    return `'${schema.fromRoot}'`;
  }

  for (const child of schema.children) {
    const childRoute = printAbsolutePaths(child, level + 1);
    absolutes.push(`${child.name}: ${childRoute}`);
  }

  const output = `{ ${absolutes.join('\n,')} }`;

  return level === 1 ? `export const ROUTES = ${output}` : output;
}

function printRelativePaths(schema: BuiltRouteSchema, level = 1): string {
  const relatives: string[] = [];

  if (schema.children.length) {
    relatives.push(`index: '${schema.fromParent}'`);
  } else {
    return `'${schema.fromParent}'`;
  }

  for (const child of schema.children) {
    const childRoute = printRelativePaths(child, level + 1);
    relatives.push(`${child.name}: ${childRoute}`);
  }

  const output = `{ ${relatives.join('\n,')} }`;

  return level === 1 ? `export const RELATIVE_ROUTES = ${output}` : output;
}

function printFactories(schema: BuiltRouteSchema): string {
  const factories: string[] = [];

  const factory = schema.type
    ? `(params: ${schema.type}) => \`${schema.factory}\``
    : `() => '${schema.factory}'`;

  let parent: BuiltRouteSchema | null = schema.parent;
  let nameFromRoot: string[] = [schema.name];
  while (parent) {
    // ignore home
    if (parent.parent) {
      nameFromRoot = [parent.name, ...nameFromRoot];
    }
    parent = parent.parent;
  }

  if (schema.children.length) {
    // with children, we do
    const visitor = nameFromRoot.join('_');
    // 1. const workspace_doc = () => 'workspace/doc'
    factories.push(`const ${visitor} = ${factory}`);
    for (const child of schema.children) {
      // 2. generate children for workspace_doc
      factories.push(printFactories(child));
    }
    // 3. workspace.doc = workspace_doc
    const parentNameFromRoot = nameFromRoot.slice(0, -1).join('_');
    if (parentNameFromRoot) {
      factories.push(`${parentNameFromRoot}.${schema.name} = ${visitor}`);
    }
  } else {
    // without children, we directly
    const parentNameFromRoot = nameFromRoot.slice(0, -1).join('_');
    if (parentNameFromRoot) {
      // parent.child = () => 'child'
      factories.push(`${parentNameFromRoot}.${schema.name} = ${factory}`);
    } else {
      // const route = () => 'route'
      factories.push(`const ${schema.name} = ${factory}`);
    }
  }

  const output = factories.join('\n');

  if (!schema.parent) {
    const firstLevelNames = schema.children.map(child => child.name);
    firstLevelNames.push(schema.name);
    return `${output}\nexport const FACTORIES = { ${firstLevelNames.join(
      ', '
    )} };`;
  }

  return output;
}

async function printRoutes(schema: BuiltRouteSchema) {
  const parts = {
    ['Path Parameter Types']: printSchemaTypes,
    ['Absolute Paths']: printAbsolutePaths,
    ['Relative Paths']: printRelativePaths,
    ['Path Factories']: printFactories,
  };
  const content = await prettier(
    Object.entries(parts)
      .map(([key, print]) => {
        return `// #region ${key}\n${print(schema)}\n// #endregion`;
      })
      .join('\n\n'),
    'typescript'
  );

  fs.writeFileSync(routerOutputFile, content, 'utf-8');
}

async function build() {
  const schema = loadRoutesSchema();
  const builtSchema = buildRoutes(schema);

  await printRoutes(builtSchema);
}

await build();

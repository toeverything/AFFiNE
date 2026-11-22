#!/usr/bin/env node
// Extract contracts from the frozen source tree, never from hand-maintained lists.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dependencyRoot = process.env.AFFINE_NODE_MODULES_ROOT ?? root;
const require = createRequire(join(dependencyRoot, 'package.json'));
const ts = require('typescript');
const { build } = require('esbuild');
const { parse, buildASTSchema } = require('graphql');
const backendRequire = createRequire(
  join(dependencyRoot, 'packages/backend/server/package.json')
);
const sourceLock = await readFile(join(root, 'yarn.lock'), 'utf8');
if (sourceLock !== (await readFile(join(dependencyRoot, 'yarn.lock'), 'utf8')))
  throw new Error('Dependency checkout yarn.lock does not match frozen source');
const sourceRoot = 'packages/backend/server/src';
const destination = join(root, 'tests/oracle-contracts/v0.27.5');
const check = process.argv.includes('--check');
const output = new Map();
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
async function files(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((a, b) => compare(a.name, b.name))
      .map(e =>
        e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]
      )
  );
  return nested.flat();
}
const paths = (await files(sourceRoot)).filter(
  p => /\.tsx?$/.test(p) && !/(?:__tests__|\.spec\.|\.e2e\.)/.test(p)
);
const sources = new Map(
  await Promise.all(
    paths.map(async path => {
      const text = await readFile(join(root, path), 'utf8');
      return [
        path,
        ts.createSourceFile(
          path,
          text,
          ts.ScriptTarget.Latest,
          true,
          path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        ),
      ];
    })
  )
);
function walk(node, visitor) {
  visitor(node);
  ts.forEachChild(node, n => walk(n, visitor));
}
function decs(node) {
  return (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []).map(
    d => {
      const call = d.expression;
      return {
        name: ts.isCallExpression(call)
          ? call.expression.getText()
          : call.getText(),
        args: ts.isCallExpression(call) ? [...call.arguments] : [],
        source: d.getText(),
      };
    }
  );
}
function location(node) {
  const f = node.getSourceFile();
  return {
    file: f.fileName,
    line: f.getLineAndCharacterOfPosition(node.getStart()).line + 1,
  };
}
const literals = new Map();
for (const file of sources.values())
  walk(file, node => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isIdentifier(node.name) &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      const name = node.name.text,
        value = node.initializer.text;
      if (!literals.has(name)) literals.set(name, new Set());
      literals.get(name).add(value);
    }
  });
function strings(node) {
  if (!node) return [''];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(strings);
  if (ts.isIdentifier(node) && literals.get(node.text)?.size === 1)
    return [...literals.get(node.text)];
  throw new Error(
    `Unresolved route expression ${node.getText()} at ${json(location(node))}`
  );
}
const routes = [],
  incoming = [],
  gateways = [],
  graphqlExports = [],
  emitted = [],
  errorClasses = [];
for (const file of sources.values())
  walk(file, node => {
    if (ts.isClassDeclaration(node)) {
      const decorators = decs(node),
        controller = decorators.find(d => d.name === 'Controller');
      const gateway = decorators.find(d => d.name === 'WebSocketGateway');
      if (gateway)
        gateways.push({
          ...location(node),
          class: node.name?.text,
          options: gateway.args.map(a => a.getText()),
          decorators,
        });
      if (
        node.heritageClauses?.some(c =>
          c.types.some(t => /(?:Error|Exception)$/.test(t.expression.getText()))
        )
      )
        errorClasses.push({
          ...location(node),
          class: node.name?.text,
          declaration: node.getText(),
        });
      for (const method of node.members) {
        if (!ts.isMethodDeclaration(method)) continue;
        const methodDecs = decs(method);
        if (controller)
          for (const route of methodDecs.filter(d =>
            /^(Get|Post|Put|Delete|Patch|All|Sse|Head|Options)$/.test(d.name)
          )) {
            for (const prefix of strings(controller.args[0]))
              for (const path of strings(route.args[0])) {
                const fullPath =
                  '/' +
                  `${prefix}/${path}`.split('/').filter(Boolean).join('/');
                const responseCalls = [];
                walk(method, n => {
                  if (
                    ts.isCallExpression(n) &&
                    ts.isPropertyAccessExpression(n.expression) &&
                    /^(status|sendStatus|setHeader|header|set|type|redirect|attachment|cookie|clearCookie)$/.test(
                      n.expression.name.text
                    )
                  )
                    responseCalls.push({
                      ...location(n),
                      expression: n.getText(),
                    });
                });
                routes.push({
                  method:
                    route.name === 'Sse' ? 'GET' : route.name.toUpperCase(),
                  full_path: fullPath,
                  ...location(method),
                  controller: node.name?.text,
                  handler: method.name.getText(),
                  sse: route.name === 'Sse',
                  rawBody: /\brawBody\b/.test(method.getText()),
                  defaultStatus: route.name === 'Post' ? 201 : 200,
                  statusOverride:
                    methodDecs
                      .find(d => d.name === 'HttpCode')
                      ?.args.map(a => a.getText()) ?? [],
                  headers: methodDecs
                    .filter(d => d.name === 'Header')
                    .map(d => d.args.map(a => a.getText())),
                  controllerDecorators: decorators,
                  methodDecorators: methodDecs,
                  parameters: method.parameters.map(p => ({
                    name: p.name.getText(),
                    type: p.type?.getText() ?? null,
                    decorators: decs(p),
                  })),
                  responseCalls,
                  implementation: method.getText(),
                });
              }
          }
        for (const event of methodDecs.filter(d =>
          /^(SubscribeMessage|RawSubscribeMessage)$/.test(d.name)
        )) {
          incoming.push({
            event: strings(event.args[0])[0],
            ...location(method),
            gateway: node.name?.text,
            namespace: gateway?.args[0]?.getText() ?? '/',
            decorators: methodDecs,
            parameters: method.parameters.map(p => ({
              name: p.name.getText(),
              type: p.type?.getText() ?? null,
              decorators: decs(p),
            })),
            ackType: method.type?.getText() ?? 'inferred; see implementation',
            implementation: method.getText(),
          });
        }
      }
    }
    if (ts.canHaveDecorators(node))
      for (const d of decs(node)) {
        if (
          /^(ObjectType|InputType|InterfaceType|Resolver|Query|Mutation|Subscription|Scalar|ResolveField)$/.test(
            d.name
          ) &&
          (!/^(Query|Mutation|Subscription|ResolveField)$/.test(d.name) ||
            ts.isMethodDeclaration(node))
        )
          graphqlExports.push({
            ...location(node),
            kind: d.name,
            name: node.name?.getText() ?? null,
            arguments: d.args.map(a => a.getText()),
          });
      }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      /^(emit|serverSideEmit)$/.test(node.expression.name.text)
    ) {
      const event = node.arguments[0];
      const receiver = node.expression.expression.getText();
      const wireReceiver =
        /^(?:this\.server|server|client|socket|sourceSocket)(?:\?|\.|$)/.test(
          receiver
        ) || node.expression.name.text === 'serverSideEmit';
      if (wireReceiver && (!event || !ts.isStringLiteralLike(event)))
        throw new Error(
          `Unresolved wire emit: ${node.getText()} at ${json(location(node))}`
        );
      if (
        event &&
        ts.isStringLiteralLike(event) &&
        (/^(space:|realtime:)/.test(event.text) ||
          node.expression.name.text === 'serverSideEmit' ||
          (event.text === 'error' &&
            /^(client|socket|this\.server)/.test(
              node.expression.expression.getText()
            )))
      )
        emitted.push({
          event: event.text,
          ...location(node),
          receiver: node.expression.expression.getText(),
          arguments: node.arguments.slice(1).map(a => a.getText()),
        });
    }
  });
// JSON-safe decorators: AST objects are never serialized.
function clean(value) {
  return JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === 'args' && Array.isArray(v) ? v.map(a => a.getText()) : v
    )
  );
}
const runtimeFile = sources.get(`${sourceRoot}/server.ts`);
const runtime = runtimeFile.text;
const numericConstants = new Map();
walk(runtimeFile, n => {
  if (ts.isVariableDeclaration(n) && n.initializer)
    numericConstants.set(n.name.getText(), n.initializer);
});
function numberExpression(n) {
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (ts.isIdentifier(n) && numericConstants.has(n.text))
    return numberExpression(numericConstants.get(n.text));
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.AsteriskToken
  )
    return numberExpression(n.left) * numberExpression(n.right);
  throw new Error(`Unresolved numeric parser limit: ${n.getText()}`);
}
const parserLimits = {
  jsonDefaultBytes: 102400,
  jsonDefaultSource: 'Express JSON default; no explicit override in server.ts',
};
walk(runtimeFile, n => {
  if (!ts.isCallExpression(n)) return;
  const call = n.expression.getText();
  const options =
    call === 'raw' || call === 'graphqlUploadExpress'
      ? n.arguments[0]
      : call === 'app.useBodyParser'
        ? n.arguments[1]
        : null;
  if (!options || !ts.isObjectLiteralExpression(options)) return;
  for (const p of options.properties)
    if (ts.isPropertyAssignment(p)) {
      const key = p.name.getText();
      if (call === 'raw' && key === 'limit')
        parserLimits.copilotAttachmentBytes = numberExpression(p.initializer);
      if (call === 'app.useBodyParser' && key === 'limit')
        parserLimits.rawBytes = numberExpression(p.initializer);
      if (call === 'graphqlUploadExpress' && key === 'maxFileSize')
        parserLimits.graphqlMaxFileBytes = numberExpression(p.initializer);
      if (call === 'graphqlUploadExpress' && key === 'maxFiles')
        parserLimits.graphqlMaxFiles = numberExpression(p.initializer);
    }
});
if (
  ![
    'copilotAttachmentBytes',
    'rawBytes',
    'graphqlMaxFileBytes',
    'graphqlMaxFiles',
  ].every(k => Number.isFinite(parserLimits[k]))
)
  throw new Error('Incomplete body parser contract');

const mounts = [];
function mountPaths(n) {
  if (!n) return ['/'];
  if (ts.isStringLiteralLike(n)) return [n.text];
  if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(mountPaths);
  if (ts.isIdentifier(n) && n.text === 'basePath') return [''];
  if (ts.isIdentifier(n) && n.text === 'rootPath') return ['/'];
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return mountPaths(n.left).flatMap(l => mountPaths(n.right).map(r => l + r));
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.BarBarToken
  )
    return mountPaths(n.right);
  if (ts.isTemplateExpression(n))
    return [
      n.head.text +
        n.templateSpans
          .map(span => {
            if (!ts.isConditionalExpression(span.expression))
              throw new Error(
                `Unresolved mount interpolation: ${span.expression.getText()}`
              );
            return mountPaths(span.expression.whenFalse)[0] + span.literal.text;
          })
          .join(''),
    ];
  throw new Error(`Unresolved imperative route ${n.getText()}`);
}
for (const file of [
  'server.ts',
  'core/static-files/static.ts',
  'core/selfhost/static.ts',
]) {
  const ast = sources.get(`${sourceRoot}/${file}`);
  let nestApplication = false;
  walk(ast, n => {
    if (
      !ts.isVariableDeclaration(n) ||
      n.name.getText() !== 'app' ||
      !n.initializer
    )
      return;
    const initializer = ts.isAwaitExpression(n.initializer)
      ? n.initializer.expression
      : n.initializer;
    if (
      ts.isCallExpression(initializer) &&
      initializer.expression.getText() === 'NestFactory.create'
    )
      nestApplication = true;
  });
  walk(ast, n => {
    if (
      !ts.isCallExpression(n) ||
      !ts.isPropertyAccessExpression(n.expression) ||
      n.expression.expression.getText() !== 'app'
    )
      return;
    const method = n.expression.name.text;
    if (
      !['get', 'post', 'put', 'delete', 'patch', 'all', 'use'].includes(
        method
      ) ||
      (method !== 'use' && n.arguments.length < 2)
    )
      return;
    // Nest's app.get is dependency lookup; Express adapters own HTTP get mounts.
    if (method === 'get' && nestApplication) return;
    const first = n.arguments[0];
    const hasPath =
      first &&
      (ts.isStringLiteralLike(first) ||
        ts.isArrayLiteralExpression(first) ||
        ts.isBinaryExpression(first) ||
        ts.isTemplateExpression(first) ||
        (ts.isIdentifier(first) &&
          ['basePath', 'rootPath'].includes(first.text)));
    if (method !== 'use' && !hasPath) return;
    for (const path of hasPath ? mountPaths(first) : ['/'])
      mounts.push({
        method: method.toUpperCase(),
        full_path: path || '/',
        ...location(n),
        flavor: file.includes('/selfhost/')
          ? 'selfhost'
          : file.includes('/static-files/')
            ? 'standard'
            : 'all',
        pathExpression: hasPath ? first.getText() : null,
        implementation: n.getText(),
      });
  });
}
walk(runtimeFile, n => {
  if (
    ts.isCallExpression(n) &&
    n.expression.getText() === 'SwaggerModule.setup'
  ) {
    for (const path of strings(n.arguments[0]))
      mounts.push({
        method: 'USE',
        full_path: path,
        ...location(n),
        flavor: 'development',
        transport: 'Swagger UI',
        implementation: n.getText(),
      });
  }
});
const gqlModule = sources.get(`${sourceRoot}/base/graphql/index.ts`);
walk(gqlModule, n => {
  if (
    ts.isPropertyAssignment(n) &&
    n.name.getText() === 'path' &&
    ts.isStringLiteralLike(n.initializer)
  ) {
    for (const method of ['GET', 'POST'])
      mounts.push({
        method,
        full_path: n.initializer.text,
        ...location(n),
        flavor: 'all',
        transport: 'GraphQL',
        implementation: gqlModule.text,
      });
  }
});
const { Server: SocketServer } = backendRequire('socket.io');
const socketPath = new SocketServer().path();
for (const method of ['GET', 'POST', 'WEBSOCKET'])
  mounts.push({
    method,
    full_path: socketPath,
    file: `${sourceRoot}/base/websocket/adapter.ts`,
    line: 1,
    flavor: 'all',
    transport: 'Socket.IO / Engine.IO',
    implementation: sources.get(`${sourceRoot}/base/websocket/adapter.ts`).text,
  });
mounts.sort((a, b) =>
  compare(
    `${a.method} ${a.full_path} ${a.file}:${a.line}`,
    `${b.method} ${b.full_path} ${b.file}:${b.line}`
  )
);

output.set(
  'rest-routes.json',
  json(
    clean({
      mounts,
      global: {
        source: `${sourceRoot}/server.ts`,
        prefix: 'config.server.path (optional)',
        guards: ['AuthGuard (except worker role)', 'CloudThrottlerGuard'],
        middlewareSource: runtime,
        bodyParsers: { rawBody: true, ...parserLimits },
      },
      routes: routes.sort((a, b) =>
        compare(`${a.method} ${a.full_path}`, `${b.method} ${b.full_path}`)
      ),
    })
  )
);
const typeDeclarations = [];
for (const file of sources.values()) {
  if (!/sync\/gateway|realtime|telemetry|websocket/.test(file.fileName))
    continue;
  walk(file, n => {
    if (
      ts.isInterfaceDeclaration(n) ||
      ts.isTypeAliasDeclaration(n) ||
      ts.isEnumDeclaration(n)
    )
      typeDeclarations.push({
        ...location(n),
        name: n.name.text,
        declaration: n.getText(),
      });
  });
}
output.set(
  'socketio-events.json',
  json(
    clean({
      gateways,
      incoming: incoming.sort((a, b) => compare(a.event, b.event)),
      outgoing: emitted.sort((a, b) =>
        compare(
          `${a.event}:${a.file}:${a.line}`,
          `${b.event}:${b.file}:${b.line}`
        )
      ),
      types: typeDeclarations,
      sharedRealtimeSource: await readFile(
        join(root, 'packages/common/realtime/src/index.ts'),
        'utf8'
      ),
      errorWrapperSource: sources.get(`${sourceRoot}/base/nestjs/exception.ts`)
        .text,
      adapterSource: sources.get(`${sourceRoot}/base/websocket/adapter.ts`)
        .text,
      optionsSource: sources.get(`${sourceRoot}/base/websocket/config.ts`).text,
      binaryEncoding:
        'Sync update/stateVector/awarenessUpdate are base64 strings (v1); v2 updates may use Uint8Array and Socket.IO binary attachments; see implementations and interfaces.',
    })
  )
);
const sdl = await readFile(join(root, sourceRoot, 'schema.gql'), 'utf8');
const document = parse(sdl),
  schema = buildASTSchema(document);
output.set('schema.gql', sdl);
const frontendSchema = await readFile(
  join(root, 'packages/common/graphql/src/schema.ts'),
  'utf8'
);
const frontendAst = ts.createSourceFile(
  'schema.ts',
  frontendSchema,
  ts.ScriptTarget.Latest,
  true
);
const frontendDeclarations = new Map();
walk(frontendAst, n => {
  if (
    (ts.isInterfaceDeclaration(n) ||
      ts.isTypeAliasDeclaration(n) ||
      ts.isEnumDeclaration(n)) &&
    n.name
  )
    frontendDeclarations.set(n.name.text, n);
});
const missingFrontendTypes = [],
  frontendFieldDifferences = [];
const scalarFields = new Set(
  frontendDeclarations.get('Scalars').members.map(m => m.name.getText())
);
for (const type of Object.values(schema.getTypeMap()).filter(
  t => !t.name.startsWith('__')
)) {
  const declaration =
    frontendDeclarations.get(type.name) ??
    [...frontendDeclarations.values()].find(
      d => d.name.text.toLowerCase() === type.name.toLowerCase()
    );
  if (!declaration && !scalarFields.has(type.name)) {
    missingFrontendTypes.push(type.name);
    continue;
  }
  if (type.getFields && declaration) {
    const members = declaration.members ?? declaration.type?.members;
    if (!members) {
      frontendFieldDifferences.push({
        type: type.name,
        reason: 'not an object type',
      });
      continue;
    }
    const expected = Object.keys(type.getFields()).sort(compare);
    const actual = members
      .map(m => m.name?.getText())
      .filter(n => n && n !== '__typename')
      .sort(compare);
    if (json(expected) !== json(actual))
      frontendFieldDifferences.push({ type: type.name, expected, actual });
  }
}
const roots = {
  Query: schema.getQueryType(),
  Mutation: schema.getMutationType(),
  Subscription: schema.getSubscriptionType(),
};
const rootFields = Object.fromEntries(
  Object.entries(roots).map(([k, v]) => [
    k,
    v ? Object.keys(v.getFields()).sort(compare) : [],
  ])
);
// Export audit is intentionally separate from SDL: source-only additions must be visible.
const missingRoots = graphqlExports
  .filter(e => /^(Query|Mutation|Subscription)$/.test(e.kind))
  .filter(e => {
    const m = e.arguments.join(',').match(/\bname:\s*['"]([^'"]+)/);
    return !rootFields[e.kind].includes(m ? m[1] : e.name);
  });
output.set(
  'schema-audit.json',
  json({
    sdlSource: `${sourceRoot}/schema.gql`,
    sdlSha256: sha(sdl),
    frontendSource: 'packages/common/graphql/src/schema.ts',
    frontendSha256: sha(frontendSchema),
    rootFields,
    missingRoots,
    missingFrontendTypes,
    frontendFieldDifferences,
    exports: graphqlExports,
    note: 'Exact checked-in NestJS autoSchemaFile artifact. Source-only exports are reported, never silently synthesized into authoritative SDL.',
  })
);
const errorSource = sources.get(`${sourceRoot}/base/error/def.ts`);
let definitions;
walk(errorSource, n => {
  if (
    ts.isVariableDeclaration(n) &&
    n.name.getText() === 'USER_FRIENDLY_ERRORS'
  )
    definitions = n.initializer;
});
const js = ts.transpileModule(`const definitions = ${definitions.getText()};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const defs = runInNewContext(js + '\ndefinitions', Object.create(null), {
  timeout: 1000,
});
let statusDefinition;
walk(errorSource, n => {
  if (
    ts.isVariableDeclaration(n) &&
    n.name.getText() === 'BaseTypeToHttpStatusMap'
  )
    statusDefinition = n.initializer;
});
if (!statusDefinition || !ts.isObjectLiteralExpression(statusDefinition))
  throw new Error('Missing status map source');
const { HttpStatus } = backendRequire('@nestjs/common');
const statusMap = Object.fromEntries(
  statusDefinition.properties.map(p => {
    if (
      !ts.isPropertyAssignment(p) ||
      !ts.isPropertyAccessExpression(p.initializer) ||
      p.initializer.expression.getText() !== 'HttpStatus'
    )
      throw new Error(`Unresolved status mapping ${p.getText()}`);
    const status = HttpStatus[p.initializer.name.text];
    if (!Number.isInteger(status))
      throw new Error('Unresolved HTTP status enum');
    return [p.name.getText().replace(/^['"]|['"]$/g, ''), status];
  })
);
const { STATUS_CODES } = await import('node:http');
const errors = Object.entries(defs)
  .sort(([a], [b]) => compare(a, b))
  .map(([name, def]) => ({
    name: name.toUpperCase(),
    class: name
      .split('_')
      .map(p => p[0].toUpperCase() + p.slice(1))
      .join(''),
    type: def.type.toUpperCase(),
    status: statusMap[def.type],
    code: STATUS_CODES[statusMap[def.type]],
    args: def.args ?? {},
    messageTemplate:
      typeof def.message === 'string' ? def.message : def.message.toString(),
    graphqlExtensions: {
      status: statusMap[def.type],
      code: STATUS_CODES[statusMap[def.type]],
      type: def.type.toUpperCase(),
      name: name.toUpperCase(),
      message: '<evaluated messageTemplate>',
      data: '<args; omitted when undefined>',
      requestId:
        statusMap[def.type] >= 500
          ? '<requestId; omitted when undefined>'
          : '<omitted>',
      stacktrace: 'canary namespace only',
    },
  }));
output.set(
  'error-catalog.json',
  json({
    errors,
    classes: errorClasses,
    serializationSource: errorSource.text,
    exceptionMapping: sources.get(`${sourceRoot}/base/nestjs/exception.ts`)
      .text,
  })
);

// Bundle the actual production mail registry and renderer; expose only its imported components.
const registry = sources.get(`${sourceRoot}/mails/index.tsx`);
let rendererObject;
walk(registry, n => {
  if (ts.isVariableDeclaration(n) && n.name.getText() === 'Renderers')
    rendererObject = ts.isAsExpression(n.initializer)
      ? n.initializer.expression
      : n.initializer;
});
const registrations = rendererObject.properties.map(p => ({
  name: p.name.getText(),
  component: p.initializer.arguments[0].getText(),
}));
const bundle = await build({
  entryPoints: [join(root, registry.fileName)],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  nodePaths: [join(dependencyRoot, 'node_modules')],
  plugins: [
    {
      name: 'expose-oracle-components',
      setup(b) {
        b.onLoad({ filter: /mails\/index\.tsx$/ }, () => ({
          contents:
            registry.text +
            `\nexport const OracleComponents = {${[...new Set(registrations.map(r => r.component))].join(',')}};`,
          loader: 'tsx',
        }));
      },
    },
  ],
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  mod,
  mod.exports,
  createRequire(import.meta.url)
);
const NativeDate = Date;
class FrozenDate extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : ['2026-01-01T00:00:00.000Z']));
  }
  static now() {
    return 1767225600000;
  }
}
process.env.TZ = 'UTC';
globalThis.Date = FrozenDate;
globalThis.env = { testing: false };
const mailTypes = new Map(),
  mailComponents = new Map();
for (const file of sources.values())
  if (file.fileName.includes('/mails/'))
    walk(file, n => {
      if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n))
        mailTypes.set(n.name.text, n);
      if (ts.isFunctionDeclaration(n) && n.name)
        mailComponents.set(n.name.text, n);
    });
function propLeaves(type, path = '', seen = new Set()) {
  if (!type) return [];
  if (ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText();
    if (name === 'Date') return [{ path, type: 'Date' }];
    if (seen.has(name)) return [];
    const declaration = mailTypes.get(name);
    if (!declaration) throw new Error(`Unknown mail prop type: ${name}`);
    return propLeaves(
      ts.isTypeAliasDeclaration(declaration) ? declaration.type : declaration,
      path,
      new Set([...seen, name])
    );
  }
  if (type.members)
    return type.members.flatMap(member =>
      propLeaves(
        member.type,
        path ? `${path}.${member.name.getText()}` : member.name.getText(),
        seen
      )
    );
  const primitive = {
    [ts.SyntaxKind.StringKeyword]: 'string',
    [ts.SyntaxKind.NumberKeyword]: 'number',
    [ts.SyntaxKind.BooleanKeyword]: 'boolean',
  }[type.kind];
  if (!primitive)
    throw new Error(`Unsupported mail prop type ${type.getText()}`);
  return [{ path, type: primitive }];
}
const manifest = {
  propDeclarations: [...mailTypes.values()].map(n => ({
    ...location(n),
    declaration: n.getText(),
  })),
  clock: '2026-01-01T00:00:00.000Z',
  timezone: 'UTC',
  renderer: `${sourceRoot}/mails/render.ts`,
  react: backendRequire('react/package.json').version,
  reactDom: backendRequire('react-dom/package.json').version,
  templates: [],
};
function leaves(value, path = '') {
  if (value instanceof NativeDate)
    return [{ path, value: value.toISOString(), type: 'Date' }];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k)
    );
  return [{ path, value, type: typeof value }];
}
function replaceLeaf(value, path, replacement) {
  const clone = structuredClone(value);
  const keys = path.split('.');
  let obj = clone;
  for (const k of keys.slice(0, -1)) obj = obj[k];
  obj[keys.at(-1)] = replacement;
  return clone;
}
for (const registration of registrations.sort((a, b) =>
  compare(a.name, b.name)
)) {
  const component = mod.exports.OracleComponents[registration.component];
  const props = component.PreviewProps ?? {};
  const renderer = mod.exports.Renderers[registration.name];
  const result = await renderer(props);
  const points = [];
  // Re-render one leaf at a time: exact byte windows identify dynamic interpolation,
  // including escaped HTML/URLs, dates and conditional branches.
  const declaration = mailComponents.get(registration.component);
  if (!declaration)
    throw new Error(`Missing component declaration ${registration.component}`);
  const probes = leaves(props).filter(leaf => leaf.path);
  for (const leaf of propLeaves(declaration.parameters[0]?.type)) {
    if (!probes.some(p => p.path === leaf.path))
      probes.push({ ...leaf, present: false });
  }
  for (const leaf of probes) {
    let alternate;
    if (leaf.type === 'Date')
      alternate = new NativeDate('2031-12-25T00:00:00.000Z');
    else if (leaf.type === 'string')
      alternate = `ORACLE_${leaf.path.replace(/\W/g, '_')}`;
    else if (leaf.type === 'boolean') alternate = !leaf.value;
    else if (leaf.type === 'number')
      alternate = leaf.value === undefined ? 24 : leaf.value + 1;
    else continue;
    const changed = await renderer(replaceLeaf(props, leaf.path, alternate));
    let start = 0;
    while (
      start < result.html.length &&
      start < changed.html.length &&
      result.html[start] === changed.html[start]
    )
      start++;
    let end = result.html.length,
      otherEnd = changed.html.length;
    while (
      end > start &&
      otherEnd > start &&
      result.html[end - 1] === changed.html[otherEnd - 1]
    ) {
      end--;
      otherEnd--;
    }
    points.push({
      ...leaf,
      htmlRange:
        start === result.html.length && start === changed.html.length
          ? null
          : {
              startByte: Buffer.byteLength(result.html.slice(0, start)),
              endByte: Buffer.byteLength(result.html.slice(0, end)),
              baseline: result.html.slice(start, end),
              alternate: changed.html.slice(start, otherEnd),
            },
      subjectChanges: changed.subject !== result.subject,
    });
  }
  output.set(`mails/${registration.name}.html`, result.html);
  manifest.templates.push({
    ...registration,
    source: location(declaration),
    componentSource: declaration.getText(),
    file: `${registration.name}.html`,
    subject: result.subject,
    props,
    sha256: sha(result.html),
    bytes: Buffer.byteLength(result.html),
    interpolations: points,
  });
}
globalThis.Date = NativeDate;
output.set('mails/manifest.json', json(manifest));
const inputDigests = [...sources]
  .filter(([p]) => !p.includes('/seed/'))
  .map(([p, f]) => ({ file: p, sha256: sha(f.text) }));
inputDigests.push(
  { file: 'packages/backend/server/src/schema.gql', sha256: sha(sdl) },
  {
    file: 'packages/common/graphql/src/schema.ts',
    sha256: sha(frontendSchema),
  },
  {
    file: 'packages/common/realtime/src/index.ts',
    sha256: sha(
      await readFile(
        join(root, 'packages/common/realtime/src/index.ts'),
        'utf8'
      )
    ),
  },
  {
    file: 'yarn.lock',
    sha256: sha(await readFile(join(root, 'yarn.lock'), 'utf8')),
  }
);
inputDigests.sort((a, b) => compare(a.file, b.file));
const version = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8')
).version;
const summary = {
  version,
  sourceSha256: sha(json(inputDigests)),
  counts: {
    sdlLines: sdl.trimEnd().split('\n').length,
    sdlDefinitions: document.definitions.length,
    restRoutes: routes.length,
    imperativeMounts: mounts.length,
    clientEvents: incoming.length,
    serverEvents: new Set(emitted.map(e => e.event)).size,
    errorCodes: errors.length,
    mailTemplates: registrations.length,
  },
  schemaSourceOnlyRoots: missingRoots,
  sourceDigests: inputDigests,
  artifacts: [...output].map(([file, data]) => ({ file, sha256: sha(data) })),
};
output.set('manifest.json', json(summary));
const drift = [];
for (const [path, data] of output) {
  const target = join(destination, path);
  if (check) {
    let existing;
    try {
      existing = await readFile(target, 'utf8');
    } catch {}
    if (existing !== data) drift.push(path);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }
}
if (check) {
  const actual = (await files(relative(root, destination)))
    .map(p => relative(destination, join(root, p)))
    .filter(p => !/(?:^|\/)(?:AGENTS|CLAUDE)\.md$/.test(p));
  for (const p of actual) if (!output.has(p)) drift.push(`unexpected:${p}`);
}
if (drift.length) throw new Error(`Contract drift: ${drift.join(', ')}`);
console.log(
  json({
    ...summary.counts,
    sourceOnlyGraphqlRoots: missingRoots.length,
    missingFrontendTypes: missingFrontendTypes.length,
    frontendFieldDifferences: frontendFieldDifferences.length,
    mode: check ? 'check: zero drift' : 'extract',
  })
);

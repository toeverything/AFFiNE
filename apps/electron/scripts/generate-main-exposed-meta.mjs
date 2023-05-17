const mainDistDir = path.resolve(__dirname, '../dist/layers/main');

// be careful and avoid any side effects in
const { handlers, events } = await import(
  'file://' + path.resolve(mainDistDir, 'exposed.js')
);

const handlersMeta = Object.entries(handlers).map(
  ([namespace, namespaceHandlers]) => {
    return [
      namespace,
      Object.keys(namespaceHandlers).map(handlerName => handlerName),
    ];
  }
);

const eventsMeta = Object.entries(events).map(
  ([namespace, namespaceHandlers]) => {
    return [
      namespace,
      Object.keys(namespaceHandlers).map(handlerName => handlerName),
    ];
  }
);

const meta = {
  handlers: handlersMeta,
  events: eventsMeta,
};

await fs.writeFile(
  path.resolve(mainDistDir, 'exposed-meta.js'),
  `module.exports = ${JSON.stringify(meta)};`
);

console.log('generate main exposed-meta.js done');

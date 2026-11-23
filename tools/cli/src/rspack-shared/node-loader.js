import { parse } from 'node:path';

export const raw = true;
/**
 * @type {import('webpack').LoaderDefinitionFunction}
 */
export default function loader(content) {
  const name = parse(this.resourcePath).base;
  this.emitFile(name, content);

  return `
    import { createRequire } from 'node:module'

    const require = createRequire(import.meta.url)
    const binding = require('./${name}')
    export default binding
  `;
}

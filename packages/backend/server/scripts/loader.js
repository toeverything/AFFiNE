import { create, createEsmHooks } from 'ts-node';

const service = create({
  experimentalSpecifierResolution: 'node',
  transpileOnly: true,
  logError: true,
  skipProject: true,
});
const hooks = createEsmHooks(service);

export const resolve = hooks.resolve;

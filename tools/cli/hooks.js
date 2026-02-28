import { create, createEsmHooks, register } from 'ts-node';

const service = create({
  experimentalSpecifierResolution: 'node',
  esm: true,
  transpileOnly: true,
});

register(service);
const hooks = createEsmHooks(service);

export const resolve = hooks.resolve;
export const load = hooks.load;

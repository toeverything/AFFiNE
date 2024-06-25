import 'ses';

lockdown();

const sandbox = new Compartment();

export default ({ iife, nodeIds, params }) => {
  sandbox.globalThis.nodeIds = harden(nodeIds);
  sandbox.globalThis.params = harden(params);
  return sandbox.evaluate(iife);
};

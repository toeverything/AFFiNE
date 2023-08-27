import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @type {import('.')} */
const binding = require('./storage.node');

export const Storage = binding.Storage;
export const mergeUpdatesInApplyWay = binding.mergeUpdatesInApplyWay;

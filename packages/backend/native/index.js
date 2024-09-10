import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @type {import('.')} */
const binding = require('./server-native.node');

export const mergeUpdatesInApplyWay = binding.mergeUpdatesInApplyWay;
export const verifyChallengeResponse = binding.verifyChallengeResponse;
export const mintChallengeResponse = binding.mintChallengeResponse;
export const getMime = binding.getMime;
export const Tokenizer = binding.Tokenizer;
export const fromModelName = binding.fromModelName;
export const htmlSanitize = binding.htmlSanitize;

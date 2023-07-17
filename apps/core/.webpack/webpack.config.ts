import { createConfiguration } from './config.js';
import { merge } from 'webpack-merge';

export default async function (_cli_env: any, _argv: any) {
  return createConfiguration();
}

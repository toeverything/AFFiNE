import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export const argsParser = () => {
  const opts = yargs(hideBin(process.argv))
    .options('app-name', {
      type: 'string',
    })
    .strict().argv;
  if (opts instanceof Promise) throw new TypeError();
  return {
    appName: opts['app-name'],
  };
};

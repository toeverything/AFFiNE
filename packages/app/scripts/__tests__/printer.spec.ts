import { test, expect } from '@playwright/test';
import { printer } from './../printer';
const chalk = require('chalk');
test.describe('printer', () => {
  test('test debug', () => {
    expect(printer.debug('test debug')).toBe(
      chalk.green`debug` + chalk.white('  - test debug')
    );
  });

  test('test info', () => {
    expect(printer.info('test info')).toBe(
      chalk.rgb(19, 167, 205)`info` + chalk.white('  - test info')
    );
  });
  test('test warn', () => {
    expect(printer.warn('test warn')).toBe(
      chalk.yellow`warn` + chalk.white('  - test warn')
    );
  });
});

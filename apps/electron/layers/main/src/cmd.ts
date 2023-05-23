import { exec } from 'child_process';

import { isMacOS } from '../../utils';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { productName } = require('../../../scripts/product');
export const registerCommandInterface = () => {
  if (isMacOS()) {
    exec(
      `sudo ln -sf /Applications/${productName}.app/Contents/MacOS/${productName.toLowerCase()} /usr/local/bin/${productName.toLowerCase()}`,
      error => {
        if (error) {
          console.error('Failed to register command:', error);
        } else {
          console.log('Command registered successfully.');
        }
      }
    );
  }
};

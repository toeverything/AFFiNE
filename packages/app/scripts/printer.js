const chalk = require('chalk');
const printer = {
  debug: () => {
    void 0;
  },
  verbose: () => {
    void 0;
  },
  info: msg => {
    console.log(chalk.rgb(19, 167, 205)`info` + chalk.white('  - ' + msg));
  },
  warn: () => {
    void 0;
  },
  fatal: () => {
    void 0;
  },
};
module.exports = { printer };

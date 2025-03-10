const chalk = require('chalk');
const util = require('util');
const lib = require('./index');
const fs = require('fs');

module.exports = function (dirPath) {
  if (fs.existsSync(dirPath)) {
    const linkedDeps = lib.filterProperties(lib.getLocalLinks(dirPath), [
      // This also defines the order of the props
      'name',
      'absolutePath',
      'gitState',
      'children',
    ]);
    if (linkedDeps.length) {
      console.log(
        `----------------------------------\n${chalk.magenta(
          'MAP OF LINKED DEPENDENCIES'
        )}\n`
      );
      console.log(
        util.inspect(linkedDeps, {
          showHidden: false,
          depth: null,
          colors: true,
        })
      );
    }
  } else {
    console.log(chalk.red(`No pnpm-lock.yaml file found in ${dirPath}`));
  }
};

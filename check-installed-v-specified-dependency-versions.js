const chalk = require('chalk');
const util = require('util');
const lib = require('./index');
const fs = require('fs');

module.exports = function (linkTree) {
  try {
    const dependencySummary = {};
    if (linkTree) {
      linkTree.forEach((dep) => {
        lib.checkDep(dep, dependencySummary);
      });

      console.log(
        `----------------------------------\n${chalk.magenta(
          'DEPENDENCY VERSIONS'
        )}\n`
      );
      console.log(
        util.inspect(dependencySummary, {
          showHidden: false,
          depth: null,
          colors: true,
        })
      );
      console.log('----------------------------------');
    }
  } catch (err) {
    console.log(chalk.red(err));
  }
};

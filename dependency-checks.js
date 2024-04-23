const chalk = require('chalk');

const util = require('util');
const lib = require('./index');

module.exports = function (environment, ENV, deps, localDevRepos) {
  try {
    const linkedDeps = lib.filterProperties(lib.getLocalLinks(process.cwd()), [
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

    if (environment === 'development' || environment === 'test') {
      ENV.dependencySummary = {};
      deps.forEach((dep) => {
        lib.checkDep(dep, ENV);
      });

      console.log(
        `----------------------------------\n${chalk.magenta(
          'DEPENDENCY VERSIONS'
        )}\n`
      );
      console.log(
        util.inspect(ENV.dependencySummary, {
          showHidden: false,
          depth: null,
          colors: true,
        })
      );
      console.log('----------------------------------');

      lib.checkLocalDevRepos(localDevRepos);
    }
  } catch (err) {
    console.log(chalk.red(err));
  }
};

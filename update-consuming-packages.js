const chalk = require('chalk');
const lib = require('./index');
const simpleGit = require('simple-git');
const path = require('path');
const results = [];

module.exports = async function (localConfig) {
  localConfig.dependentPackage.name = path.basename(localConfig.dependentPackage.localRepoPath);

  try {
    const dependentPackageDir = path.resolve(process.cwd(), localConfig.dependentPackage.localRepoPath);
    localConfig.dependentPackage.git = simpleGit({
      baseDir: dependentPackageDir,
    });
    const currentDependentBranch = (await localConfig.dependentPackage.git.branch()).current;
    const branchLockItem = localConfig.branchLock.find((item) => item[localConfig.dependentPackage.name].trim() === currentDependentBranch);
    if (!branchLockItem) {
      console.log(chalk.cyan(`Stopping as no branch lock entry exists for branch ${currentDependentBranch} in ${localConfig.dependenPackage.name}.`));
      return;
    }
    console.log(chalk.white('[ -----------------------Branch lock----------------------- ]'));
    console.log(chalk.white('The following is a breakdown of which branches will be updated in the listed repos.'));
    console.log(chalk.white(JSON.stringify(branchLockItem, null, 2)));

    console.log(chalk.white('[ -----------------------Preliminary checks started----------------------- ]'));

    await lib.initialiseRepo(localConfig.dependentPackage, 'cyan', branchLockItem, localConfig.dependentPackage);
    const consumingPackages = [];
    const consumingPackagesFiltered = localConfig.localConsumingPackages.filter((item) => !item.skip);
    for (const item of consumingPackagesFiltered) {
      const repoPath = path.resolve(process.cwd(), item.localRepoPath);
      item.name = path.basename(item.localRepoPath);
      item.git = simpleGit({
        baseDir: repoPath,
      });
      await lib.initialiseRepo(item, 'blue', branchLockItem, localConfig.dependentPackage);
      consumingPackages.push(item);
    }

    console.log(chalk.white('[ -----------------------Preliminary checks completed----------------------- ]'));

    await lib.commitPackage(localConfig.dependentPackage, 'cyan');
    await lib.pushPackage(localConfig.dependentPackage, 'cyan');

    for (const consumingPackage of consumingPackages) {
      try {
        const result = {
          app: consumingPackage.name,
        };
        lib.updateDependencyVersion(localConfig.dependentPackage, await lib.latestCommit(localConfig.dependentPackage), consumingPackage, 'blue');

        await lib.bumpVersion(consumingPackage, 'blue');
        if (consumingPackage.commit) {
          await lib.commitPackage(consumingPackage, 'blue');
        }
        if (consumingPackage.commit && consumingPackage.push) {
          await lib.pushPackage(consumingPackage, 'blue');
        } else if (consumingPackage.commit) {
          console.log(chalk.blue(`[${consumingPackage.name}] code committed but not pushed.`));
        }
        result.hash = await lib.latestCommit(consumingPackage);
        result.gitState = lib.gitState(consumingPackage);
        results.push(result);
      } catch (err) {
        console.log(chalk.red(err));
      }
    }
    if (!results.length) {
      console.log(chalk.yellow('No consuming apps were updated'));
      return;
    }
    const skipped = localConfig.localConsumingPackages.filter((item) => item.skip);
    await lib.logResults(results, skipped);
  } catch (err) {
    console.log(chalk.red(err));
  }
};

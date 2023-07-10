const chalk = require('chalk');
const lib = require('./index');
const simpleGit = require('simple-git');
const path = require('path');
const results = [];

module.exports = async function (localConfig) {
  localConfig.parentPackage = lib.parsePackageConfig(localConfig.parentPackage);
  localConfig.parentPackage.updatePackageFile = localConfig.parentPackage.commit ? true : localConfig.parentPackage.updatePackageFile;

  try {
    const parentPackageDir = path.resolve(process.cwd(), localConfig.parentPackage.localRepoPath);
    console.log(parentPackageDir);

    localConfig.parentPackage.git = simpleGit({
      baseDir: parentPackageDir,
    });
    const currentParentPackageBranch = (await localConfig.parentPackage.git.branch()).current;
    const branchLockItem = localConfig.branchLock.find((item) => item[localConfig.parentPackage.name].trim() === currentParentPackageBranch);
    if (!branchLockItem) {
      console.log(chalk.cyan(`Stopping as no branch lock entry exists for branch ${currentParentPackageBranch} in ${localConfig.parentPackage.name}.`));
      return;
    }
    console.log(chalk.white('[ -----------------------Branch lock----------------------- ]'));
    console.log(chalk.white('The following is a breakdown of which branches will be updated in the listed repos.'));
    console.log(chalk.white(JSON.stringify(branchLockItem, null, 2)));

    console.log(chalk.white('[ -----------------------Preliminary checks started----------------------- ]'));

    await lib.initialiseRepo(localConfig.parentPackage, branchLockItem, localConfig.parentPackage);
    const dependentPackages = [];

    const dependentPackagesFiltered = localConfig.localDependents.filter((dependentPackage) => !dependentPackage.skip);
    for (let dependentPackage of dependentPackagesFiltered) {
      dependentPackage = lib.parsePackageConfig(dependentPackage);
      await lib.initialiseRepo(dependentPackage, branchLockItem, localConfig.parentPackage);
      dependentPackages.push(dependentPackage);
    }

    console.log(chalk.white('[ -----------------------Preliminary checks completed----------------------- ]'));

    for (const dependentPackage of dependentPackages) {
      try {
        const status = await dependentPackage.git.status();
        dependentPackage.hasChangesToCommit = status.files.length > 0;

        if (dependentPackage.hasChangesToCommit && !dependentPackage.commitMessage && dependentPackage.amendLatestCommit !== 'no-edit') {
          console.log(chalk.blue(`[${dependentPackage.name}] Skipping as there are changes to commit, but no commit message was provided.`));
          continue;
        } else {
          await lib.commitPackage(dependentPackage);
        }
        if (dependentPackage.push) {
          await lib.pushPackage(dependentPackage);
        } else if (dependentPackage.hasChangesToCommit) {
          console.log(chalk.blue(`[${dependentPackage.name}] code committed but not pushed.`));
        }

        const result = dependentPackage;
        result.commitSHA = await lib.latestCommit(dependentPackage);

        if ((localConfig.parentPackage.updatePackageFile || localConfig.parentPackage.push) && dependentPackage.packageName) {
          lib.updateDependencyVersion(dependentPackage, await lib.latestCommit(dependentPackage), localConfig.parentPackage);
          result.parentPackageUpdated = true;
        }
        result.gitState = lib.gitState(dependentPackage);
        results.push(result);
      } catch (err) {
        console.log(chalk.red(err));
      }
    }
    if (localConfig.parentPackage.commit || localConfig.parentPackage.push) {
      await lib.commitPackage(localConfig.parentPackage);
    }
    if (localConfig.parentPackage.push) {
      await lib.pushPackage(localConfig.parentPackage);
    }

    if (!results.length) {
      console.log(chalk.yellow('No dependent packages were updated'));
      return;
    }
    const skipped = localConfig.localDependents.filter((item) => item.skip);
    await lib.logResults(results, skipped);
    return results;
  } catch (err) {
    console.log(chalk.red(err));
  }
};

const chalk = require('chalk');
const lib = require('./index');
const nodeSundries = require('node-sundries');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
let status;
const results = [];

module.exports = async function (localConfig) {
  if (nodeSundries.argExists('--help')) {
    // printHelp();
    return;
  }
  localConfig.parentPackage.name = path.basename(localConfig.parentPackage.localRepoPath);
  localConfig.parentPackage.commit = localConfig.parentPackage.push ? true : localConfig.parentPackage.commit;
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

    await lib.initialiseRepo(localConfig.parentPackage, 'cyan', branchLockItem, localConfig.parentPackage);
    const dependentPackages = [];

    const dependentPackagesFiltered = localConfig.localDependents.filter((item) => !item.skip);
    for (const item of dependentPackagesFiltered) {
      const repoPath = path.resolve(process.cwd(), item.localRepoPath);
      item.localRepoPath = repoPath;
      item.name = path.basename(item.localRepoPath);
      item.packageName = item.packageName || path.basename(repoPath);
      item.git = simpleGit({
        baseDir: repoPath,
      });
      await lib.initialiseRepo(item, 'blue', branchLockItem, localConfig.parentPackage);
      dependentPackages.push(item);
    }

    console.log(chalk.white('[ -----------------------Preliminary checks completed----------------------- ]'));

    for (const dependentPackage of dependentPackages) {
      try {
        status = await dependentPackage.git.status();
        dependentPackage.hasChangesToCommit = status.files.length > 0;

        if (dependentPackage.hasChangesToCommit && !dependentPackage.commitMessage && dependentPackage.amendLatestCommit !== 'no-edit') {
          console.log(chalk.blue(`[${dependentPackage.name}] Skipping as there are changes to commit, but no commit message was provided.`));
          continue;
        } else {
          await lib.commitPackage(dependentPackage, 'blue');
        }
        if (dependentPackage.push) {
          await lib.pushPackage(dependentPackage, 'blue');
        } else if (dependentPackage.hasChangesToCommit) {
          console.log(chalk.blue(`[${dependentPackage.name}] code committed but not pushed.`));
        }

        const result = {
          app: dependentPackage.name,
          hash: await lib.latestCommit(dependentPackage),
        };
        if ((localConfig.parentPackage.updatePackageFile || localConfig.parentPackage.push) && dependentPackage.packageName) {
          lib.updateDependencyVersion(dependentPackage, await lib.latestCommit(dependentPackage), localConfig.parentPackage, 'blue');
          result.parentPackageUpdated = true;
        }
        result.gitState = lib.gitState(dependentPackage);
        results.push(result);
      } catch (err) {
        console.log(chalk.red(err));
      }
    }
    if (localConfig.parentPackage.commit || localConfig.parentPackage.push) {
      await lib.commitPackage(localConfig.parentPackage, 'cyan');
    }
    if (localConfig.parentPackage.push) {
      await lib.pushPackage(localConfig.parentPackage, 'cyan');
    }

    if (!results.length) {
      console.log(chalk.yellow('No dependent packages were updated'));
      return;
    }
    const skipped = localConfig.localDependents.filter((item) => item.skip);
    await lib.logResults(results, skipped);
  } catch (err) {
    console.log(chalk.red(err));
  }
};

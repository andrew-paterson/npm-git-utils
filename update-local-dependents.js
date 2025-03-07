const chalk = require('chalk');
const lib = require('./index');
const simpleGit = require('simple-git');
const path = require('path');
const results = [];

module.exports = async function (localConfig) {
  localConfig.parentPackage = lib.parsePackageConfig(localConfig.parentPackage);
  localConfig.parentPackage.updatePackageFile = localConfig.parentPackage.commit
    ? true
    : localConfig.parentPackage.updatePackageFile;

  try {
    const dependentPackagesFiltered = localConfig.localDependencies.filter(
      (dependentPackage) => !dependentPackage.skip
    );
    const parentPackageDir = path.resolve(
      process.cwd(),
      localConfig.parentPackage.localRepoPath
    );
    localConfig.parentPackage.git = simpleGit({
      baseDir: parentPackageDir,
    });
    const branchLockItem = await lib.currentBranchLockItem(
      localConfig.parentPackage,
      localConfig.branchLock
    );

    const displayBranchLockItem = Object.assign({}, branchLockItem);
    for (const key in displayBranchLockItem) {
      if (
        !dependentPackagesFiltered.find((item) =>
          item.localRepoPath.endsWith(key)
        ) &&
        !localConfig.parentPackage.localRepoPath.endsWith(key)
      ) {
        delete displayBranchLockItem[key];
      }
    }
    lib.logHeader('BRANCH LOCK SUMMARY');
    console.log(
      chalk.white(
        'The following is a breakdown of which branches will be updated in the listed repos.'
      )
    );
    console.log(chalk.yellow(JSON.stringify(displayBranchLockItem, null, 2)));
    lib.logHeader('PRELIMINARY CHECKS STARTED');
    await lib.initialiseRepo(
      localConfig.parentPackage,
      branchLockItem,
      localConfig.parentPackage
    );
    const dependentPackages = [];

    for (let dependentPackage of dependentPackagesFiltered) {
      dependentPackage = lib.parsePackageConfig(dependentPackage);
      await lib.initialiseRepo(
        dependentPackage,
        branchLockItem,
        localConfig.parentPackage
      );
      dependentPackages.push(dependentPackage);
    }
    lib.logHeader('PRELIMINARY CHECKS COMPLETED, UPDATING CONSUMING PACKAGES');

    for (const dependentPackage of dependentPackages) {
      try {
        const status = await dependentPackage.git.status();
        dependentPackage.hasChangesToCommit = status.files.length > 0;

        if (
          dependentPackage.hasChangesToCommit &&
          !dependentPackage.commitMessage &&
          dependentPackage.amendLatestCommit !== 'no-edit'
        ) {
          console.log(
            chalk[dependentPackage.logColour](
              `[${dependentPackage.name}] Skipping as there are changes to commit, but no commit message was provided.`
            )
          );
          continue;
        } else {
          await lib.commitPackage(dependentPackage);
        }
        if (dependentPackage.push) {
          await lib.pushPackage(dependentPackage);
        } else if (dependentPackage.hasChangesToCommit) {
          console.log(
            chalk[dependentPackage.logColour](
              `[${dependentPackage.name}] code committed but not pushed.`
            )
          );
        }

        const result = dependentPackage;

        result.commitSHA = await lib.latestCommitHash(dependentPackage);
        result.latestCommitMessage = (
          await lib.latestCommit(dependentPackage)
        ).message;
        let updatedDependencyVersion;
        if (dependentPackage.updatedDependencyVersionFunc) {
          updatedDependencyVersion =
            await dependentPackage.updatedDependencyVersionFunc(
              dependentPackage
            );
        } else {
          updatedDependencyVersion = await lib.latestCommitHash(
            dependentPackage
          );
        }
        if (
          localConfig.parentPackage.updatePackageFile ||
          localConfig.parentPackage.push
        ) {
          lib.updateDependencyVersion(
            dependentPackage,
            updatedDependencyVersion,
            localConfig.parentPackage
          );
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
    const skipped = localConfig.localDependencies.filter((item) => item.skip);
    await lib.logResults(results, skipped);
    return results;
  } catch (err) {
    console.log(chalk.red(err));
  }
};

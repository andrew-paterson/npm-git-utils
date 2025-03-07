const chalk = require('chalk');
const lib = require('./index');
const results = [];

module.exports = async function (localConfig) {
  localConfig.dependentPackage = lib.parsePackageConfig(
    localConfig.dependentPackage
  );
  try {
    const consumingPackagesFiltered = localConfig.localConsumingPackages.filter(
      (consumingPackage) => !consumingPackage.skip
    );
    const branchLockItem = await lib.currentBranchLockItem(
      localConfig.dependentPackage,
      localConfig.branchLock
    );

    if (!branchLockItem) {
      return;
    }
    const displayBranchLockItem = Object.assign({}, branchLockItem);
    for (const key in displayBranchLockItem) {
      if (
        !consumingPackagesFiltered.find((item) =>
          item.localRepoPath.endsWith(key)
        ) &&
        !localConfig.dependentPackage.localRepoPath.endsWith(key)
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
      localConfig.dependentPackage,
      branchLockItem,
      localConfig.dependentPackage
    );
    const consumingPackages = [];

    for (let consumingPackage of consumingPackagesFiltered) {
      consumingPackage = lib.parsePackageConfig(consumingPackage);
      await lib.initialiseRepo(
        consumingPackage,
        branchLockItem,
        localConfig.dependentPackage
      );
      consumingPackages.push(consumingPackage);
    }
    lib.logHeader('PRELIMINARY CHECKS COMPLETED, UPDATING CONSUMING PACKAGES');
    if (localConfig.dependentPackage.commit) {
      await lib.commitPackage(localConfig.dependentPackage);
    } else {
      console.log(
        chalk[localConfig.dependentPackage.logColour](
          `[${localConfig.dependentPackage.name}] code not committed.`
        )
      );
    }

    await lib.pushPackage(localConfig.dependentPackage);
    for (const consumingPackage of consumingPackages) {
      try {
        const result = consumingPackage;
        let dependentPackageVersion;
        if (localConfig.dependentPackage.dependentPackageVersionFunc) {
          dependentPackageVersion =
            await localConfig.dependentPackage.dependentPackageVersionFunc(
              localConfig.dependentPackage
            );
        } else {
          dependentPackageVersion = await lib.latestCommitHash(
            localConfig.dependentPackage
          );
        }
        lib.updateDependencyVersion(
          localConfig.dependentPackage,
          dependentPackageVersion,
          consumingPackage
        );
        await lib.bumpVersion(consumingPackage);
        if (consumingPackage.customEditsFunc) {
          await consumingPackage.customEditsFunc(
            consumingPackage,
            localConfig.dependentPackage,
            dependentPackageVersion
          );
        }
        if (consumingPackage.commit) {
          await lib.commitPackage(consumingPackage);
        } else {
          console.log(
            chalk[consumingPackage.logColour](
              `[${consumingPackage.name}] code not committed.`
            )
          );
        }
        if (consumingPackage.push) {
          await lib.pushPackage(consumingPackage);
        } else if (consumingPackage.commit) {
          console.log(
            chalk[consumingPackage.logColour](
              `[${consumingPackage.name}] code committed but not pushed.`
            )
          );
        }
        if (consumingPackage.tag) {
          await lib.tagLatestCommit(consumingPackage);
        }
        result.latestTag = await lib.latestTag(consumingPackage);
        result.dependencySHA = dependentPackageVersion;

        result.commitSHA = await lib.latestCommitHash(consumingPackage);
        result.latestCommitMessage = (
          await lib.latestCommit(consumingPackage)
        ).message;
        result.gitState = lib.gitState(consumingPackage);
        results.push(result);
      } catch (err) {
        console.log(chalk.red(err));
      }
    }
    return results;
  } catch (err) {
    console.log(chalk.red(err));
  }
};

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
    console.log(
      chalk.white(
        '[ -----------------------Branch lock----------------------- ]'
      )
    );
    console.log(
      chalk.white(
        'The following is a breakdown of which branches will be updated in the listed repos.'
      )
    );
    console.log(chalk.white(JSON.stringify(displayBranchLockItem, null, 2)));

    console.log(
      chalk.white(
        '[ -----------------------Preliminary checks started----------------------- ]'
      )
    );

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

    console.log(
      chalk.white(
        '[ -----------------------Preliminary checks completed----------------------- ]'
      )
    );
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
        const dependentPackageVersion = await lib.latestCommitHash(
          localConfig.dependentPackage
        );
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

    const skipped = localConfig.localConsumingPackages.filter(
      (item) => item.skip
    );
    await lib.logResults(results, skipped);
    return results;
  } catch (err) {
    console.log(chalk.red(err));
  }
};

const chalk = require('chalk');
const lib = require('./index');
const results = [];
let finalConsumedPackage;

module.exports = async function (localConfig) {
  for (let [index, consumedPackage] of localConfig.consumedPackages.entries()) {
    if (index + 1 === localConfig.consumedPackages.length) {
      finalConsumedPackage = true;
    }
    consumedPackage = lib.parsePackageConfig(consumedPackage);
    try {
      const consumingPackagesFiltered = localConfig.consumingPackages.filter(
        (consumingPackage) => !consumingPackage.skip
      );
      const branchLockItem = await lib.currentBranchLockItem(
        consumedPackage,
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
          !consumedPackage.localRepoPath.endsWith(key)
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
        consumedPackage,
        branchLockItem,
        consumedPackage
      );
      const consumingPackages = [];

      for (let consumingPackage of consumingPackagesFiltered) {
        consumingPackage = lib.parsePackageConfig(consumingPackage);
        await lib.initialiseRepo(
          consumingPackage,
          branchLockItem,
          consumedPackage
        );
        consumingPackages.push(consumingPackage);
      }
      lib.logHeader(
        'PRELIMINARY CHECKS COMPLETED, UPDATING CONSUMING PACKAGES'
      );
      if (consumedPackage.commit) {
        await lib.commitPackage(consumedPackage);
      } else {
        console.log(
          chalk[consumedPackage.logColour](
            `[${consumedPackage.name}] code not committed.`
          )
        );
      }

      await lib.pushPackage(consumedPackage);
      consumedPackage.commitSHA = await lib.latestCommitHash(consumedPackage);
      for (const consumingPackage of consumingPackages) {
        try {
          const result = consumingPackage;

          let comsumedPackageVersion;
          if (consumedPackage.updatedConsumingpackageVersionFunc) {
            comsumedPackageVersion =
              await consumedPackage.updatedConsumingpackageVersionFunc(
                consumedPackage
              );
          } else {
            comsumedPackageVersion = await lib.latestCommitHash(
              consumedPackage
            );
          }
          lib.updateDependencyVersion(
            consumedPackage,
            comsumedPackageVersion,
            consumingPackage
          );
          if (finalConsumedPackage) {
            await lib.bumpVersion(consumingPackage);
            if (consumingPackage.customEditsFunc) {
              await consumingPackage.customEditsFunc(
                consumingPackage,
                consumedPackage,
                comsumedPackageVersion
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
            result.dependencySHA = comsumedPackageVersion;

            result.commitSHA = await lib.latestCommitHash(consumingPackage);
            result.latestCommitMessage = (
              await lib.latestCommit(consumingPackage)
            ).message;
            result.gitState = lib.gitState(consumingPackage);
            results.push(result);
          }
        } catch (err) {
          console.log(chalk.red(err));
        }
      }
      return results;
    } catch (err) {
      console.log(chalk.red(err));
    }
  }
};

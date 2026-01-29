const chalk = require('chalk');
const lib = require('./index');
const results = [];

async function doBranchLock(
  consumingPackagesFiltered,
  consumedPackagesFiltered,
  branchLock,
) {
  const branchLockItem = await lib.currentBranchLockItem(
    consumingPackagesFiltered,
    consumedPackagesFiltered,
    branchLock,
  );
  if (!branchLockItem) {
    return;
  }
  const displayBranchLockItem = Object.assign({}, branchLockItem);
  for (const key in displayBranchLockItem) {
    if (
      !consumingPackagesFiltered
        .concat(consumedPackagesFiltered)
        .find((item) => item.localRepoPath.endsWith(key))
    ) {
      delete displayBranchLockItem[key];
    }
  }
  lib.logHeader('BRANCH LOCK SUMMARY');
  console.log(
    chalk.white(
      'The following is a breakdown of which branches will be updated in the listed repos.',
    ),
  );
  console.log(chalk.yellow(JSON.stringify(displayBranchLockItem, null, 2)));
  return displayBranchLockItem;
}

function filterAndParsePackages(localConfig) {
  return ['consumingPackages', 'consumedPackages'].map((key) => {
    return localConfig[key]
      .filter((consumingPackage) => !consumingPackage.skip)
      .map((item) => lib.parsePackageConfig(item));
  });
}

async function initialiseRepos(packageConfigs, branchLockItem) {
  lib.logHeader('PRELIMINARY CHECKS STARTED');

  const promises = packageConfigs.map((packageConfig) => {
    return lib.initialiseRepo(packageConfig, branchLockItem);
  });
  return await Promise.all(promises);
}

async function processPackages(type, opts) {
  const packagesToProcess = opts[`${type}PackagesFiltered`];
  const promises = packagesToProcess.map((consumedPackage) => {
    return processPackage(consumedPackage, type, opts);
  });
  return await Promise.all(promises);
}

async function processPackage(package, type, opts) {
  const result = package;
  if (type === 'consuming') {
    for (let consumedPackage of opts.consumedPackagesFiltered) {
      lib.updateDependencyVersions(
        consumedPackage,
        consumedPackage.consumedVersion,
        package,
      );
      result.dependencySHAs = result.dependencySHAs || [];
      result.dependencySHAs.push({
        name: consumedPackage.name,
        sha: consumedPackage.consumedVersion,
      });
    }
  }
  await lib.bumpVersion(package);
  if (package.customEditsFunc) {
    await package.customEditsFunc(package);
  }
  if (package.commit) {
    await lib.commitPackage(package);
  } else {
    console.log(
      chalk[package.logColour](`[${package.name}] code not committed.`),
    );
  }
  if (package.push) {
    await lib.pushPackage(package);
  } else if (package.commit) {
    console.log(
      chalk[package.logColour](
        `[${package.name}] code committed but not pushed.`,
      ),
    );
  }
  if (type === 'consumed') {
    package.packageJsonVersion = await lib.getCurrentPackageVersion(package);
    package.commitSHA = await lib.latestCommitHash(package);
    if (package.versionFn) {
      package.consumedVersion = await package.versionFn(package);
    } else {
      package.consumedVersion = await lib.getCurrentPackageVersion(package);
    }
  }
  if (package.tag) {
    await lib.tagLatestCommit(package);
  }
  result.latestTag = await lib.latestTag(package);
  result.commitSHA = await lib.latestCommitHash(package);
  result.latestCommitMessage = (await lib.latestCommit(package)).message;
  result.gitState = lib.gitState(package);
  results.push(result);
}

module.exports = async function (localConfig) {
  try {
    const [consumingPackagesFiltered, consumedPackagesFiltered] =
      filterAndParsePackages(localConfig);
    const branchLockItem = await doBranchLock(
      consumingPackagesFiltered,
      consumedPackagesFiltered,
      localConfig.branchLock,
    );
    await initialiseRepos(
      consumingPackagesFiltered.concat(consumedPackagesFiltered),
      branchLockItem,
    );
    lib.logHeader('PRELIMINARY CHECKS COMPLETED, UPDATING CONSUMING PACKAGES');
    const opts = {
      consumedPackagesFiltered: consumedPackagesFiltered,
      consumingPackagesFiltered: consumingPackagesFiltered,
    };
    await processPackages('consumed', opts);
    await processPackages('consuming', opts);

    return results;
  } catch (err) {
    console.log(chalk.red(err));
  }
};

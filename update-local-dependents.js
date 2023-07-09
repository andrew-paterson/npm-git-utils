const chalk = require('chalk');
const lib = require('./index');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
let status;
const results = [];

module.exports = async function (localConfig) {
  if (lib.argExists('--help')) {
    // printHelp();
    return;
  }
  localConfig.parentPackage.name = path.basename(localConfig.parentPackage.localRepoPath);
  localConfig.parentPackage.commit = localConfig.parentPackage.push ? true : localConfig.parentPackage.commit;
  localConfig.parentPackage.updatePackageFile = localConfig.parentPackage.commit ? true : localConfig.parentPackage.updatePackageFile;

  try {
    const parentPackageDir = path.resolve(process.cwd());
    const parentPackageGit = simpleGit({
      baseDir: parentPackageDir,
    });
    const currentParentPackageBranch = (await parentPackageGit.branch()).current;
    const branchLockItem = localConfig.branchLock.find((item) => item[localConfig.parentPackage.name].trim() === currentParentPackageBranch);
    if (!branchLockItem) {
      console.log(chalk.cyan(`Stopping as no branch lock entry exists for branch ${currentParentPackageBranch} in ${localConfig.parentPackage.name}.`));
      return;
    }
    console.log(chalk.white('[ -----------------------Branch lock----------------------- ]'));
    console.log(chalk.white('The following is a breakdown of which branches will be updated in the listed repos.'));
    console.log(chalk.white(JSON.stringify(branchLockItem, null, 2)));

    console.log(chalk.white('[ -----------------------Preliminary checks started----------------------- ]'));

    await initialiseRepo(localConfig.parentPackage.name, parentPackageGit, 'cyan', branchLockItem, localConfig);
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
      await initialiseRepo(item.name, item.git, 'blue', branchLockItem, localConfig);
      dependentPackages.push(item);
    }

    console.log(chalk.white('[ -----------------------Preliminary checks completed----------------------- ]'));

    for (const dependentPackage of dependentPackages) {
      try {
        status = await dependentPackage.git.status();
        dependentPackage.hasChangesToCommit = status.files.length > 0;
        const gitLog = await dependentPackage.git.log();

        if (!dependentPackage.hasChangesToCommit) {
          console.log(chalk.blue(`[${dependentPackage.name}] Nothing to commit - HEAD is still at ${gitLog.latest.hash}`));
        } else if (!dependentPackage.commitMessage && dependentPackage.amendLatestCommit !== 'no-edit') {
          console.log(chalk.blue(`[${dependentPackage.name}] Skipping as there are chnages to commit, but no commit message was provided.`));
          continue;
        } else {
          await commitPackage(dependentPackage.git, dependentPackage, 'blue');
        }

        if (dependentPackage.push) {
          await pushPackage(dependentPackage.git, dependentPackage, 'blue');
        } else if (dependentPackage.hasChangesToCommit) {
          console.log(chalk.blue(`[${dependentPackage.name}] code committed but not pushed.`));
        }

        const result = {
          app: dependentPackage.name,
          hash: await latestCommit(dependentPackage.git),
        };
        if ((localConfig.parentPackage.updatePackageFile || localConfig.parentPackage.push) && dependentPackage.packageName) {
          updatePackageVersion(dependentPackage, await latestCommit(dependentPackage.git), localConfig.parentPackage);
          result.parentPackageUpdated = true;
        }
        results.push(result);
      } catch (err) {
        console.log(chalk.red(err));
      }
    }
    if (localConfig.parentPackage.commit || localConfig.parentPackage.push) {
      await commitPackage(parentPackageGit, localConfig.parantPackage, 'cyan');
    }
    if (localConfig.parentPackage.push) {
      await pushPackage(parentPackageGit, localConfig.parentPackage, 'cyan');
    }

    if (!results.length) {
      console.log(chalk.yellow('No dependent packages were updated'));
      return;
    }
    await logResults(results, localConfig);
  } catch (err) {
    console.log(chalk.red(err));
  }
};

async function logResults(results, localConfig) {
  console.log('RESULT');
  console.log(results);
  console.log('SKIPPED');
  const dependentPackagesSkippedGit = [];
  const dependentPackagesSkipped = localConfig.localDependents.filter((item) => item.skip);
  for (const item of dependentPackagesSkipped) {
    const repoPath = path.resolve(process.cwd(), item.localRepoPath);
    item.name = path.basename(item.localRepoPath);
    item.git = simpleGit({
      baseDir: repoPath,
    });
    dependentPackagesSkippedGit.push({
      app: path.basename(item.localRepoPath),
      gitState: lib.gitState(item),
    });
  }
  console.log(dependentPackagesSkippedGit);
}

function updatePackageVersion(dependentPackage, version, packageConfig) {
  const packageFilePath = path.resolve(packageConfig.localRepoPath, 'package.json');
  const packageFile = require(packageFilePath);
  if (packageFile.dependencies[dependentPackage.packageName].split('#')[1] === version) {
    console.log(chalk.cyan(`[${packageConfig.name}] Version already set to ${version}, no update required.`));
    return;
  }
  const dependentPackagePackageLink = packageFile.dependencies[dependentPackage.packageName].split('#')[0];
  packageFile.dependencies[dependentPackage.packageName] = `${dependentPackagePackageLink}#${version}`;
  fs.writeFileSync(packageFilePath, JSON.stringify(packageFile, null, 2));
  console.log(chalk.cyan(`[${packageConfig.name}] Updated version of ${dependentPackagePackageLink} to ${version}`));
}

async function commitPackage(packageGit, packageConfig, logColour) {
  await packageGit.add('.');
  console.log(chalk.cyan(`[${packageConfig.name}] Added untracked files`));
  let packageCommitMessage = packageConfig.commitMessage;
  const commitOptions = {};
  if (packageConfig.amendLatestCommit) {
    commitOptions['--amend'] = true;
  }
  if (packageConfig.amendLatestCommit === 'no-edit') {
    commitOptions['--no-edit'] = true;
    packageCommitMessage = [];
  }
  const packageCommitResult = await packageGit.commit(packageCommitMessage, commitOptions);
  const newSha = packageCommitResult.commit.length ? packageCommitResult.commit : null;
  if (newSha) {
    console.log(chalk[logColour](`[${packageConfig.name}] Add commit ${newSha} in branch ${packageCommitResult.branch}: ${JSON.stringify(packageCommitResult.summary)}`));
  } else {
    console.log(chalk[logColour](`[${packageConfig.name}] Nothing to commit - head is still at ${await latestCommit(packageGit)}`));
  }
}

async function pushPackage(packageGit, packageConfig, logColour) {
  const pushOptions = [];
  if (packageConfig.amendLatestCommit) {
    pushOptions.push('-f');
  }
  const parentPackagePush = await packageGit.push(pushOptions);
  const parentPackagePushMessage = (parentPackagePush.pushed[0] || {}).alreadyUpdated ? 'Already pushed' : 'Pushed code';
  console.log(chalk[logColour](`[${packageConfig.name}] ${parentPackagePushMessage}`));
}

async function initialiseRepo(repoName, git, logColour, branchLockItem, localConfig) {
  const branch = await branchLockPass(repoName, git, logColour, branchLockItem, localConfig);
  if (!branch) {
    throw 'Error';
  }
  await git.fetch('origin', branch);
  const remoteCommits = (await git.raw('rev-list', `origin/${branch}`)).split('\n');
  const localCommits = (await git.raw('rev-list', `${branch}`)).split('\n');
  if (localCommits.indexOf(remoteCommits[0]) < 0 && remoteCommits.indexOf(localCommits[0]) < 0) {
    // Remote and local have diverged
    throw `[${repoName}] ${branch} and origin/${branch} have diverged. This must be resolved before continuing.`;
  } else if (localCommits[0] === remoteCommits[0]) {
    // Local is up top date with remote
    console.log(chalk[logColour](`[${repoName}] ${branch} is up to date with origin/${branch}.`));
  } else if (localCommits.indexOf(remoteCommits[0]) > -1 && remoteCommits.indexOf(localCommits[0]) < 0) {
    // Local ahead of remote
    console.log(chalk[logColour](`[${repoName}] ${branch} is ahead of origin/${branch} and can be pushed.`));
  } else if (remoteCommits.indexOf(localCommits[0]) > -1 && localCommits.indexOf(remoteCommits[0]) < 0) {
    // Remote ahead of local
    console.log(chalk[logColour](`[${repoName}] origin/${branch} is ahead of ${branch}.`));
    if ((await git.status()).isClean()) {
      await git.pull();
      console.log(chalk[logColour](`[${repoName}] Pulled ${branch} branch.`));
    } else {
      throw `[${repoName}] origin/${branch} is ahead of ${branch} but ${branch} has uncommitted changes. This must be resolved before continuing.`;
    }
  }
  console.log(chalk[logColour](`[${repoName}] ${branch} - initialisation complete.`));
}

async function branchLockPass(appName, git, logColour, branchLockItem, localConfig) {
  try {
    if (!branchLockItem[appName]) {
      throw `[${appName}] Error - the branch lock entry which includes ${localConfig.parentPackage.name}: ${branchLockItem[localConfig.parentPackage.name]}" does not specify a branch for ${appName}.`;
    }
    const currentAppBranch = (await git.branch()).current;
    if (branchLockItem[appName] !== currentAppBranch) {
      console.log(chalk[logColour](`[${appName}] Switching from branch "${currentAppBranch}" to "${branchLockItem[appName]}" as per branch lock entry.`));
      await git.checkout(branchLockItem[appName]);
    }
    return (await git.branch()).current;
  } catch (err) {
    console.log(chalk.red(err));
    throw err;
  }
}

async function latestCommit(git) {
  const gitLog = await git.log();
  return ((gitLog.all || [])[0] || {}).hash;
}

const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');

module.exports = {
  gitState(options) {
    const gitState = require('git-state');
    const getGitInfo = require('git-repo-info');
    if (gitState.isGitSync(options.localRepoPath)) {
      const repoState = gitState.checkSync(options.localRepoPath);
      const gitInfo = getGitInfo(options.localRepoPath);
      const gitStatus = {};
      for (const key in repoState) {
        if (repoState[key] > 0) {
          gitStatus[key] = repoState[key];
        }
      }
      const output = gitStatus || {};
      output.lastCommit = `${gitInfo.abbreviatedSha} "${gitInfo.commitMessage}"`;
      return output;
    }
    return false;
  },

  commitPackage: async function (packageGit, packageConfig, logColour) {
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
    if (packageConfig.amendLatestCommit === true) {
      console.log(chalk[logColour](`[${packageConfig.name}] Amend latest commit with an updated commit message ${await this.latestCommit(packageGit)}`));
    } else if (newSha) {
      if (packageConfig.amendLatestCommit === 'no-edit') {
        console.log(chalk[logColour](`[${packageConfig.name}] Amend latest commit the same commit message to ${newSha} in branch ${packageCommitResult.branch}: ${JSON.stringify(packageCommitResult.summary)}`));
      } else {
        console.log(chalk[logColour](`[${packageConfig.name}] Add commit ${newSha} in branch ${packageCommitResult.branch}: ${JSON.stringify(packageCommitResult.summary)}`));
      }
    } else {
      console.log(chalk[logColour](`[${packageConfig.name}] Nothing to commit - head is still at ${await this.latestCommit(packageGit)}`));
    }
  },

  logResults: async function (results, localConfig) {
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
        gitState: this.gitState(item),
      });
    }
    console.log(dependentPackagesSkippedGit);
  },

  updatePackageVersion(dependentPackage, version, packageConfig) {
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
  },

  pushPackage: async function (packageGit, packageConfig, logColour) {
    const pushOptions = [];
    if (packageConfig.amendLatestCommit) {
      pushOptions.push('-f');
    }
    const parentPackagePush = await packageGit.push(pushOptions);
    const pushMessage = pushOptions.indexOf('-f') > -1 ? 'Force pushed code' : 'Pushed code';
    const parentPackagePushMessage = (parentPackagePush.pushed[0] || {}).alreadyUpdated ? 'Already pushed' : pushMessage;
    console.log(chalk[logColour](`[${packageConfig.name}] ${parentPackagePushMessage}`));
  },

  initialiseRepo: async function (repoName, git, logColour, branchLockItem, localConfig) {
    const branch = await this.branchLockPass(repoName, git, logColour, branchLockItem, localConfig);
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
  },

  branchLockPass: async function (appName, git, logColour, branchLockItem, localConfig) {
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
  },

  latestCommit: async function (git) {
    const gitLog = await git.log();
    return ((gitLog.all || [])[0] || {}).hash;
  },
};

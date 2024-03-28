const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const moment = require('moment');

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

  parsePackageConfig(packageConfig) {
    packageConfig.localRepoPath = path.resolve(
      process.cwd(),
      packageConfig.localRepoPath
    );
    packageConfig.name = path.basename(packageConfig.localRepoPath);
    packageConfig.git = simpleGit({
      baseDir: packageConfig.localRepoPath,
    });
    packageConfig.logColour = packageConfig.logColour || 'cyan';
    packageConfig.commit = packageConfig.push ? true : packageConfig.commit;
    return packageConfig;
  },

  commitPackage: async function (packageConfig) {
    await packageConfig.git.add('.');
    console.log(
      chalk[packageConfig.logColour](
        `[${packageConfig.name}] Added untracked files`
      )
    );
    let packageCommitMessage = packageConfig.commitMessage;
    const commitOptions = {};
    if (packageConfig.amendLatestCommit) {
      commitOptions['--amend'] = true;
    }
    if (packageConfig.amendLatestCommit === 'no-edit') {
      commitOptions['--no-edit'] = true;
      packageCommitMessage = [];
    }
    const packageCommitResult = await packageConfig.git.commit(
      packageCommitMessage,
      commitOptions
    );
    const newSha = packageCommitResult.commit.length
      ? packageCommitResult.commit
      : null;
    if (packageConfig.amendLatestCommit === true) {
      console.log(
        chalk[packageConfig.logColour](
          `[${
            packageConfig.name
          }] Amend latest commit with an updated commit message ${await this.latestCommitHash(
            packageConfig.git
          )}`
        )
      );
    } else if (newSha) {
      if (packageConfig.amendLatestCommit === 'no-edit') {
        console.log(
          chalk[packageConfig.logColour](
            `[${
              packageConfig.name
            }] Amend latest commit with the same commit message to ${newSha} in branch ${
              packageCommitResult.branch
            }: ${JSON.stringify(packageCommitResult.summary)}`
          )
        );
      } else {
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.name}] Add commit ${newSha} in branch ${
              packageCommitResult.branch
            }: ${JSON.stringify(packageCommitResult.summary)}`
          )
        );
      }
    } else {
      console.log(
        chalk[packageConfig.logColour](
          `[${
            packageConfig.name
          }] Nothing to commit - head is still at ${await this.latestCommitHash(
            packageConfig
          )}`
        )
      );
    }
  },

  logResults: async function (results, skipped) {
    console.log('RESULT');
    console.log(
      results.map((result) => {
        return {
          packageName: result.name,
          latestCommitSHA: result.commitSHA,
          latestCommitMessage: result.latestCommitMessage,
        };
      })
    );
    console.log('SKIPPED');
    const dependentPackagesSkippedGit = [];
    for (const item of skipped) {
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

  packageFilePath: function (packageConfig) {
    packageConfig.npmPackageSubDir = packageConfig.npmPackageSubDir || './';
    if (!packageConfig.npmPackageSubDir.startsWith('./')) {
      packageConfig.npmPackageSubDir = `./${packageConfig.npmPackageSubDir}`;
    }
    return path.resolve(
      packageConfig.localRepoPath,
      packageConfig.npmPackageSubDir || '',
      'package.json'
    );
  },

  updateDependencyVersion: function (
    dependentPackage,
    toVersion,
    consumingPackageConfig
  ) {
    const packageFilePath = this.packageFilePath(consumingPackageConfig);
    const packageFile = require(packageFilePath);
    if (
      !(packageFile.dependencies || {})[dependentPackage.name] &&
      !(packageFile.devDependencies || {})[dependentPackage.name]
    ) {
      throw `[${consumingPackageConfig.name}] ${dependentPackage.name} is not a dependency of ${consumingPackageConfig.name}`;
    }
    const depType = (packageFile.dependencies || {})[dependentPackage.name]
      ? 'dependencies'
      : 'devDependencies';
    const fromVersion =
      packageFile[depType][dependentPackage.name].split('#')[1];
    const dependentPackagePackageLink =
      packageFile[depType][dependentPackage.name].split('#')[0];

    if (fromVersion === toVersion) {
      console.log(
        chalk[consumingPackageConfig.logColour](
          `[${consumingPackageConfig.name}] Version of ${dependentPackage.name} already set to ${toVersion}, no update required.`
        )
      );
      return;
    }
    packageFile[depType][
      dependentPackage.name
    ] = `${dependentPackagePackageLink}#${toVersion}`;
    fs.writeFileSync(
      packageFilePath,
      `${JSON.stringify(packageFile, null, 2).trim()}\n`
    );
    console.log(
      chalk[consumingPackageConfig.logColour](
        `[${consumingPackageConfig.name}] Updated version of ${dependentPackage.name} dependency from ${fromVersion} to ${toVersion}`
      )
    );
  },

  pushPackage: async function (packageConfig) {
    const pushOptions = [];
    if (packageConfig.amendLatestCommit) {
      pushOptions.push('-f');
    }
    const parentPackagePush = await packageConfig.git.push(pushOptions);
    const pushMessage =
      pushOptions.indexOf('-f') > -1 ? 'Force pushed code' : 'Pushed code';
    const parentPackagePushMessage = (parentPackagePush.pushed[0] || {})
      .alreadyUpdated
      ? 'Already pushed'
      : pushMessage;
    console.log(
      chalk[packageConfig.logColour](
        `[${packageConfig.name}] ${parentPackagePushMessage}`
      )
    );
  },

  currentBranchLockItem: async function (referencePackage, branchLockArray) {
    const currentDependentBranch = (await referencePackage.git.branch())
      .current;
    const branchLockItem = branchLockArray.find(
      (item) => item[referencePackage.name].trim() === currentDependentBranch
    );
    if (!branchLockItem) {
      console.log(
        chalk.yellow(
          `No branch lock entry exists for branch ${currentDependentBranch} in ${referencePackage.name}.`
        )
      );
      return;
    }
    console.log(branchLockItem);
    return branchLockItem;
  },

  initialiseRepo: async function (
    packageConfig,
    branchLockItem,
    referencePackageConfig
  ) {
    const branch = await this.branchLockPass(
      packageConfig,
      branchLockItem,
      referencePackageConfig
    );
    if (!branch) {
      throw 'Error';
    }
    await packageConfig.git.fetch('origin', branch);
    const remoteCommits = (
      await packageConfig.git.raw('rev-list', `origin/${branch}`)
    ).split('\n');
    const localCommits = (
      await packageConfig.git.raw('rev-list', `${branch}`)
    ).split('\n');
    if (
      localCommits.indexOf(remoteCommits[0]) < 0 &&
      remoteCommits.indexOf(localCommits[0]) < 0
    ) {
      // Remote and local have diverged
      throw `[${packageConfig.name}] ${branch} and origin/${branch} have diverged. This must be resolved before continuing.`;
    } else if (localCommits[0] === remoteCommits[0]) {
      // Local is up top date with remote
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] ${branch} is up to date with origin/${branch}.`
        )
      );
    } else if (
      localCommits.indexOf(remoteCommits[0]) > -1 &&
      remoteCommits.indexOf(localCommits[0]) < 0
    ) {
      // Local ahead of remote
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] ${branch} is ahead of origin/${branch} and can be pushed.`
        )
      );
    } else if (
      remoteCommits.indexOf(localCommits[0]) > -1 &&
      localCommits.indexOf(remoteCommits[0]) < 0
    ) {
      // Remote ahead of local
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] origin/${branch} is ahead of ${branch}.`
        )
      );
      if ((await packageConfig.git.status()).isClean()) {
        await packageConfig.git.pull();
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.name}] Pulled ${branch} branch.`
          )
        );
      } else {
        throw `[${packageConfig.name}] origin/${branch} is ahead of ${branch} but ${branch} has uncommitted changes. This must be resolved before continuing.`;
      }
    }
    console.log(
      chalk[packageConfig.logColour](
        `[${packageConfig.name}] ${branch} - initialisation complete.`
      )
    );
  },

  branchLockPass: async function (
    packageConfig,
    branchLockItem,
    referencePackageConfig
  ) {
    try {
      if (!branchLockItem[packageConfig.name]) {
        throw `[${
          packageConfig.name
        }] Error - the branch lock entry which includes ${
          referencePackageConfig.name
        }: ${
          branchLockItem[referencePackageConfig.name]
        }" does not specify a branch for ${packageConfig.name}.`;
      }
      const currentAppBranch = (await packageConfig.git.branch()).current;
      if (branchLockItem[packageConfig.name] !== currentAppBranch) {
        console.log(
          chalk[packageConfig.logColour](
            `[${
              packageConfig.name
            }] Switching from branch "${currentAppBranch}" to "${
              branchLockItem[packageConfig.name]
            }" as per branch lock entry.`
          )
        );
        await packageConfig.git.checkout(branchLockItem[packageConfig.name]);
      }
      return (await packageConfig.git.branch()).current;
    } catch (err) {
      console.log(chalk.red(err));
      throw err;
    }
  },

  latestCommit: async function (packageConfig) {
    const gitLog = await packageConfig.git.log();
    return (gitLog.all || [])[0] || {};
  },

  latestCommitHash: async function (packageConfig) {
    return (await this.latestCommit(packageConfig)).hash;
  },

  async latestTag(packageConfig) {
    const tags = await packageConfig.git.tag(['--sort=-creatordate']);
    const tagList = tags.split('\n');
    return tagList[0];
  },

  async tagLatestCommit(packageConfig) {
    let newTag;
    if (packageConfig.tagName) {
      newTag = packageConfig.tagName;
    } else {
      const packageFilePath = this.packageFilePath(packageConfig);
      const packageFile = require(packageFilePath);
      newTag = packageFile.version;
    }
    const tagArgs = packageConfig.tagMessage
      ? ['-a', newTag, '-m', packageConfig.tagMessage]
      : [newTag];
    if (!(await this.tagExists(packageConfig, newTag))) {
      await packageConfig.git.tag(tagArgs);
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] Added tag ${newTag} to latest commit.`
        )
      );
    } else {
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] Tag ${newTag} already exists.`
        )
      );
    }
    if (packageConfig.pushTags !== false) {
      await packageConfig.git.push(['--tags']);
      console.log(
        chalk[packageConfig.logColour](`[${packageConfig.name}] Pushed tags.`)
      );
    }
    return newTag;
  },

  async tagExists(packageConfig, tagName) {
    const tags = await packageConfig.git.tag(['--list']);
    return tags.split('\n').includes(tagName);
  },

  bumpVersion: async function (packageConfig) {
    const packageFilePath = this.packageFilePath(packageConfig);
    const packageFile = require(packageFilePath);
    const status = await packageConfig.git.status();
    const hasChangesToCommit = status.files.length > 0;
    if (!hasChangesToCommit) {
      return;
    }
    const currentVersion = packageFile.version;
    const currentVersionNumber = (currentVersion.match(/(\d+.\d+.\d+)/) ||
      [])[0];
    if (packageConfig.preReleaseType) {
      const suffix = `${packageConfig.preReleaseType}.${moment().format(
        'YYYYMMDDHHmm'
      )}`;
      packageFile.version = `${currentVersionNumber}-${suffix}`;
    } else {
      const releaseType = packageConfig.releaseType || 'patch';
      const releaseTypes = ['major', 'minor', 'patch'];
      const matchIndex = releaseTypes.indexOf(releaseType);
      const numbers = currentVersion.match(/(\d*)\.(\d*)\.(\d*)/);
      const newVersion = releaseTypes
        .map((_, index) => {
          if (index < matchIndex) {
            return numbers[index + 1];
          } else if (index === matchIndex) {
            return parseInt(numbers[index + 1]) + 1;
          } else {
            return '0';
          }
        })
        .join('.');
      packageFile.version = newVersion;
    }
    fs.writeFileSync(
      packageFilePath,
      `${JSON.stringify(packageFile, null, 2).trim()}\n`
    );
    console.log(
      chalk[packageConfig.logColour](
        `[${packageConfig.name}] Updated version to ${packageFile.version} in package.json.`
      )
    );
    return packageFile;
  },

  isPrimitive(test) {
    return test !== Object(test);
  },

  sortObjectKeys(obj, opts = {}) {
    const sorted = Object.keys(obj)
      .sort()
      .reduce((result, key) => {
        result[key] = obj[key];
        return result;
      }, {});
    if (!opts.primitivesFirst) {
      return sorted;
    }
    const final = {};
    [true, false].forEach((value) => {
      Object.keys(sorted).reduce((result, key) => {
        if (this.isPrimitive(sorted[key]) === value) {
          result[key] = sorted[key];
        }
        return result;
      }, final);
    });
    return final;
  },

  getUniqueDependencies(packageFileToCheck, newVersionDefaultPackageFile) {
    let uniqueDeps;
    ['dependencies', 'devDependencies'].forEach((depType) => {
      if (packageFileToCheck[depType]) {
        uniqueDeps = uniqueDeps || {};
        uniqueDeps[depType] = Object.keys(packageFileToCheck[depType])
          .filter(
            (dep) =>
              !newVersionDefaultPackageFile[depType] ||
              !newVersionDefaultPackageFile[depType][dep]
          )
          .reduce((obj, dep) => {
            obj[dep] = packageFileToCheck[depType][dep];
            return obj;
          }, {});
        // console.log(uniqueDeps);
      }
    });
    return uniqueDeps;
  },
};

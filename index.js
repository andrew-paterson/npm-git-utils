const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');
const moment = require('moment');
const gitState = require('git-state');
const nodeSundries = require('node-sundries');

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
    packageConfig.actionsLog = packageConfig.actionsLog || [];
    packageConfig.localRepoPath = path.resolve(
      process.cwd(),
      packageConfig.localRepoPath
    );
    packageConfig.name =
      packageConfig.name || path.basename(packageConfig.localRepoPath);
    packageConfig.git = simpleGit({
      baseDir: packageConfig.localRepoPath,
    });
    packageConfig.logColour = packageConfig.logColour || 'cyan';
    if (!packageConfig.commit && packageConfig.push) {
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] Overriding "push" from true to false, as "commit" is set to false.`
        )
      );
      packageConfig.push = false;
    }

    if (!packageConfig.commit && packageConfig.tag) {
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] Overriding "tag" from true to false, as "commit" is set to false.`
        )
      );
      packageConfig.tag = false;
    }
    if (packageConfig.tag && packageConfig.pushTags === undefined) {
      `[${packageConfig.name}] Applying default of true to "pushTags", because "tag" is true and "pushTags" is not set.`;
      packageConfig.pushTags = true;
    }
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
        packageConfig.actionsLog.push('Committing succeeded');
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.name}] Add commit ${newSha} in branch ${
              packageCommitResult.branch
            }: ${JSON.stringify(packageCommitResult.summary)}`
          )
        );
      }
    } else {
      packageConfig.actionsLog.push('Committing skipped');
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

  logHeader(string, logColour = 'white') {
    const separatorLine = '-'.repeat(string.length);
    console.log(
      chalk[logColour](`${separatorLine}\n${string}\n${separatorLine}`)
    );
  },

  logResults: async function (results, skipped) {
    console.log(
      results.map((result) => {
        return {
          packageName: result.name,
          latestCommitSHA: result.commitSHA,
          latestCommitMessage: result.latestCommitMessage,
        };
      })
    );
    if (!skipped) {
      return;
    }
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
    let depType;
    for (var key in packageFile) {
      if (
        packageFile[key][dependentPackage.name] &&
        !packageFile[key][dependentPackage.name].startsWith('workspace:')
      ) {
        depType = key;
      }
    }
    // depType = (packageFile.dependencies || {})[dependentPackage.name]
    //   ? 'dependencies'
    //   : 'devDependencies';
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
    try {
      const parentPackagePush = await packageConfig.git.push(pushOptions);
      const pushMessage =
        pushOptions.indexOf('-f') > -1 ? 'Force pushed code' : 'Pushed code';
      const parentPackagePushMessage = (parentPackagePush.pushed[0] || {})
        .alreadyUpdated
        ? 'Already pushed'
        : pushMessage;
      packageConfig.actionsLog.push('Pushing succeeded');
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] ${parentPackagePushMessage}`
        )
      );
    } catch (err) {
      packageConfig.actionsLog.push('Pushing failed');
    }
  },

  currentBranchLockItem: async function (
    consumingPackages,
    consumedPackages,
    branchLockArray
  ) {
    const branchesMap = {};
    for (var packageSet of [consumingPackages, consumedPackages]) {
      for (var packageConfig of packageSet) {
        branchesMap[packageConfig.name] = (
          await packageConfig.git.branch()
        ).current;
      }
    }
    const matchingBranchLockItem = branchLockArray.find((branchLockItem) => {
      return require('node:util').isDeepStrictEqual(
        branchLockItem,
        branchesMap
      );
    });

    // const currentDependentBranch = (await referencePackage.git.branch())
    //   .current;
    // const branchLockItem = branchLockArray.find(
    //   (item) =>
    //     (item[referencePackage.name] || '').trim() === currentDependentBranch
    // );
    if (!matchingBranchLockItem) {
      throw `No branch lock entry exists for branch with ${JSON.stringify(
        branchesMap,
        null,
        2
      )}.`;
    }
    return matchingBranchLockItem;
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
    try {
      packageConfig.repoOwner = await this.getRepoOwner(packageConfig);
    } catch (err) {
      console.log(chalk.red(err));
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
      try {
        await packageConfig.git.tag(tagArgs);
        packageConfig.actionsLog.push('Tagging succeeded');
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.name}] Added tag ${newTag} to latest commit.`
          )
        );
      } catch (err) {
        packageConfig.actionsLog.push('Tagging failed');
      }
    } else {
      packageConfig.actionsLog.push('Tagging skipped');
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] Tag ${newTag} already exists.`
        )
      );
    }
    if (packageConfig.pushTags !== false) {
      try {
        await packageConfig.git.push(['--tags']);
        packageConfig.actionsLog.push('Pushing tags succeeded');
        console.log(
          chalk[packageConfig.logColour](`[${packageConfig.name}] Pushed tags.`)
        );
      } catch (err) {
        packageConfig.actionsLog.push('Pushing tags failed');
      }
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
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.name}] Not updating version in package.json as ther repo has no chnages to commit.`
        )
      );
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
      console.log(packageFile.version);
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

  checkDep(dep, acc) {
    const pnpmDep = this.findPnpmDep(dep.name, dep.path);
    const final = {
      version: this.specifiedMatchesInstalledDep(pnpmDep),
    };
    if (dep.children) {
      final.children = this.processChildPackages(pnpmDep, dep.children);
    }
    acc[pnpmDep.name] = final;
  },

  findPnpmDep(depName, filePath) {
    return this.allPnpmDeps(filePath).find(
      (pnpmDep) => pnpmDep.name === depName
    );
  },
  specifiedMatchesInstalledDep(item) {
    if (!item) {
      return;
    }
    if (item.linked) {
      return `Linked locally to ${item.absolutePath} ${item.gitState}`;
    }
    const specified = this.extractVersion(item.pnpmLock.specifier);
    const installed = this.extractVersion(item.pnpmLock.version);
    return this.expectedVsFoundOutput(specified, installed);
  },

  isMonoRepoWorkspace(filePath) {
    const dirName = path.basename(filePath);
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(path.resolve(dirPath, 'pnpm-workspace.yaml'))) {
      return false;
    }
    const workspaceJson = nodeSundries.yamlFileToJs(
      path.resolve(dirPath, 'pnpm-workspace.yaml')
    );
    return (
      workspaceJson.packages.includes(`./${dirName}`) ||
      workspaceJson.packages.includes(dirName)
    );
  },

  allPnpmDeps(filePath, depTypes = ['dependencies', 'devDependencies']) {
    const pnpmLockLocation = this.isMonoRepoWorkspace(filePath)
      ? path.dirname(filePath)
      : filePath;
    const pnpmLockJson = this.pnpmLockAsJson(pnpmLockLocation);
    const packageFile = require(path.resolve(
      process.cwd(),
      filePath,
      'package.json'
    ));
    return depTypes.reduce((acc, depType) => {
      const obj = this.isMonoRepoWorkspace(filePath)
        ? pnpmLockJson.importers[path.basename(filePath)][depType]
        : pnpmLockJson[depType];
      for (const key in obj) {
        const final = {};
        final.pnpmLock = obj[key];
        final.name = key;
        final.packageJson =
          (packageFile.devDependencies || {})[key] ||
          (packageFile.dependencies || {})[key];
        if (final.pnpmLock.version.startsWith('link:')) {
          final.linked = true;
          const absolutePath = path.resolve(
            process.cwd(),
            filePath,
            final.pnpmLock.version.replace('link:', '')
          );
          final.absolutePath = absolutePath;
          final.gitState = this.checkGitState(
            absolutePath,
            this.isMonoRepoWorkspace(filePath)
          );
          if (final.pnpmLock.specifier.includes('workspace:')) {
            final.workspace = true;
          }
        }
        acc.push(final);
      }
      return acc;
    }, []);
  },

  extractVersion(string) {
    if (this.extractHash(string)) {
      return this.extractHash(string);
    }
    if (this.extractSemverString(string)) {
      return this.extractSemverString(string);
    }
    return false;
  },

  expectedVsFoundOutput(specified, installed) {
    if (
      this.extractSemverNumbers(specified) &&
      this.extractSemverNumbers(specified) ===
        this.extractSemverNumbers(installed)
    ) {
      return this.extractSemverNumbers(installed);
    }
    if (specified === installed) {
      return installed;
    }

    return {
      specified: specified,
      installed: this.extractSemverNumbers(installed) || installed,
    };
  },

  extractHash(string) {
    const hashRegex = /[0-9a-f]{40}/;
    if (!string.match(hashRegex)) {
      return false;
    }
    return string.match(hashRegex)[0];
  },

  extractSemverNumbers(string) {
    const versionRegex = /.{0,1}([0-9]+\.[0-9]+\.[0-9]+)/;
    if (!string.match(versionRegex)) {
      return false;
    }
    return string.match(versionRegex)[1];
  },

  extractSemverString(string) {
    const versionRegex = /.{0,1}[0-9]+\.[0-9]+\.[0-9]+/;
    if (!string.match(versionRegex)) {
      return false;
    }
    return string.match(versionRegex)[0];
  },

  processChildPackages(parent, children) {
    const parentName = typeof parent === 'string' ? parent : parent.name;
    const final = {};
    if ((parent || {}).linked) {
      children.forEach((child) => {
        const keyName = typeof child === 'string' ? child : child.name;
        final[keyName] = this.processChildOfLinkedPackage(parent, child);
      });
    } else {
      children.forEach((child) => {
        const keyName = typeof child === 'string' ? child : child.name;
        final[keyName] = this.processChildPackage(parentName, child, './');
      });
    }
    return final;
  },

  processChildOfLinkedPackage(pnpmDep, child) {
    const childDepName = typeof child === 'string' ? child : child.name;
    const childPnpmDep = this.findPnpmDep(childDepName, pnpmDep.absolutePath);
    childPnpmDep.via = pnpmDep.absolutePath;
    return typeof child === 'string'
      ? this.specifiedMatchesInstalledDep(childPnpmDep)
      : {
          version: this.specifiedMatchesInstalledDep(childPnpmDep),
          children: this.processChildPackages(childPnpmDep, child.children),
        };
  },

  processChildPackage(parentDep, childPackage, filePath) {
    const childDepName =
      typeof childPackage === 'string' ? childPackage : childPackage.name;
    const json = this.pnpmLockAsJson(filePath);
    let parentPackage;
    const final = {};
    for (const key in json.packages) {
      if (key.indexOf(parentDep) > -1) {
        parentPackage = json.packages[key];
      }
    }
    for (const key in parentPackage.dependencies) {
      if (childDepName === key) {
        final.expected = this.extractVersion(parentPackage.dependencies[key]);
      }
    }
    let package;
    for (const key in json.packages) {
      // Check if any of the items in the childPackages array are in the array produced by splitting the key on '/' and '@' in the key
      const keyArray = key.split(/\/|@/);
      if (keyArray.indexOf(childDepName) > -1) {
        package = json.packages[key];
        final.found =
          package.resolution.commit || package.resolution.tarball
            ? this.extractHash(
                package.resolution.commit || package.resolution.tarball
              )
            : this.extractSemverString(key);
      }
    }
    return typeof childPackage === 'string'
      ? this.expectedVsFoundOutput(final.expected, final.found)
      : {
          version: this.expectedVsFoundOutput(final.expected, final.found),
          children: this.processChildPackages(
            childDepName,
            childPackage.children
          ),
        };
  },

  pnpmLockAsJson(filePath) {
    const json = nodeSundries.yamlFileToJs(`${filePath}/pnpm-lock.yaml`);
    return Array.isArray(json) ? json[0] : json;
  },

  getLocalLinks(linkPath, acc = [], parent) {
    const locallyLinked = this.allPnpmDeps(linkPath).filter(
      (dep) => dep.linked
    );
    if (!locallyLinked.length) {
      return acc;
    }
    if (parent) {
      parent.children = locallyLinked;
    } else {
      acc = locallyLinked;
    }
    return locallyLinked.reduce((acc, link) => {
      return this.getLocalLinks(link.absolutePath, acc, link);
    }, acc);
  },

  filterProperties(array, properties) {
    return array.map((item) => {
      const filteredItem = {};
      properties.forEach((prop) => {
        if (item[prop] !== undefined) {
          filteredItem[prop] = Array.isArray(item[prop])
            ? this.filterProperties(item[prop], properties)
            : item[prop];
        }
      });
      return filteredItem;
    });
  },

  checkGitState(dirPath, isMonoRepoWorkspace) {
    if (!gitState.isGitSync(dirPath)) {
      if (!isMonoRepoWorkspace) {
        return 'Not a git repository';
      } else {
        return this.checkGitState(path.dirname(dirPath));
      }
    }
    const repoState = gitState.checkSync(dirPath);
    return `${repoState.dirty} dirty and ${repoState.untracked} untracked.`;
  },

  getRepoOwner: async (packageConfig) => {
    try {
      const remotes = await packageConfig.git.getRemotes(true);
      const originRemote = remotes.find((remote) => remote.name === 'origin');

      if (originRemote) {
        const url = originRemote.refs.fetch;
        const match = url.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);

        if (match) {
          const owner = match[1];
          return owner;
        } else {
          throw 'Could not parse repository owner from URL.';
        }
      } else {
        throw 'No origin remote found.';
      }
    } catch (error) {
      throw ('Error getting repository owner:', error);
    }
  },
};

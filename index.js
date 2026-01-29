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
      packageConfig.localRepoPath,
    );
    packageConfig.name =
      packageConfig.name || path.basename(packageConfig.localRepoPath);
    packageConfig.displayName = packageConfig.displayName || packageConfig.name;
    packageConfig.git = simpleGit({
      baseDir: packageConfig.localRepoPath,
    });
    packageConfig.npmPackageSubDirs = packageConfig.npmPackageSubDirs || ['./'];
    packageConfig.npmPackageSubDirs = packageConfig.npmPackageSubDirs.map(
      (npmPackageSubDir) => {
        if (!npmPackageSubDir.startsWith('./')) {
          npmPackageSubDir = `./${npmPackageSubDir}`;
        }
        return npmPackageSubDir;
      },
    );
    packageConfig.logColour = packageConfig.logColour || 'cyan';
    if (!packageConfig.commit && packageConfig.push) {
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] Overriding "push" from true to false, as "commit" is set to false.`,
        ),
      );
      packageConfig.push = false;
    }

    if (!packageConfig.commit && packageConfig.tag) {
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] Overriding "tag" from true to false, as "commit" is set to false.`,
        ),
      );
      packageConfig.tag = false;
    }
    if (packageConfig.tag && packageConfig.pushTags === undefined) {
      `[${packageConfig.displayName}] Applying default of true to "pushTags", because "tag" is true and "pushTags" is not set.`;
      packageConfig.pushTags = true;
    }
    return packageConfig;
  },

  commitPackage: async function (packageConfig) {
    if (!packageConfig.commit && packageConfig.amendLatestCommit) {
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] Forcing the amendlatestCommit option from ${packageConfig.amendLatestCommit} to false, as commit is set to false.`,
        ),
      );
      packageConfig.amendLatestCommit = false;
      return;
    }
    await packageConfig.git.add('.');
    console.log(
      chalk[packageConfig.logColour](
        `[${packageConfig.displayName}] Added untracked files`,
      ),
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
      commitOptions,
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
            packageConfig,
          )}`,
        ),
      );
    } else if (newSha) {
      if (packageConfig.amendLatestCommit === 'no-edit') {
        console.log(
          chalk[packageConfig.logColour](
            `[${
              packageConfig.name
            }] Amend latest commit with the same commit message to ${newSha} in branch ${
              packageCommitResult.branch
            }: ${JSON.stringify(packageCommitResult.summary)}`,
          ),
        );
      } else {
        packageConfig.actionsLog.push('Committing succeeded');
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.displayName}] Add commit ${newSha} in branch ${
              packageCommitResult.branch
            }: ${JSON.stringify(packageCommitResult.summary)}`,
          ),
        );
      }
    } else {
      packageConfig.actionsLog.push('Committing skipped');
      console.log(
        chalk[packageConfig.logColour](
          `[${
            packageConfig.name
          }] Nothing to commit - head is still at ${await this.latestCommitHash(
            packageConfig,
          )}`,
        ),
      );
    }
  },

  logHeader(string, logColour = 'white') {
    const separatorLine = '-'.repeat(string.length);
    console.log(
      chalk[logColour](`${separatorLine}\n${string}\n${separatorLine}`),
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
      }),
    );
    if (!skipped) {
      return;
    }
    console.log('SKIPPED');
    const consumedPackagesSkippedGit = [];
    for (const item of skipped) {
      const repoPath = path.resolve(process.cwd(), item.localRepoPath);
      item.name = path.basename(item.localRepoPath);
      item.git = simpleGit({
        baseDir: repoPath,
      });
      consumedPackagesSkippedGit.push({
        app: path.basename(item.localRepoPath),
        gitState: this.gitState(item),
      });
    }
    console.log(consumedPackagesSkippedGit);
  },

  mainPackageFilePath: function (packageConfig, npmPackageSubDir) {
    return path.resolve(
      packageConfig.localRepoPath,
      npmPackageSubDir || '',
      'package.json',
    );
  },

  updateDependencyVersions: function (
    consumedPackage,
    toVersion,
    consumingPackageConfig,
  ) {
    consumingPackageConfig.npmPackageSubDirs.forEach((npmPackageSubDir) => {
      this.updateDependencyVersion(
        consumedPackage,
        toVersion,
        consumingPackageConfig,
        npmPackageSubDir,
      );
    });
  },

  updateDependencyVersion: function (
    consumedPackage,
    toVersion,
    consumingPackageConfig,
    npmPackageSubDir,
  ) {
    const packageFilePath = this.mainPackageFilePath(
      consumingPackageConfig,
      npmPackageSubDir,
    );
    const packageFile = require(packageFilePath);
    if (
      !(packageFile.dependencies || {})[consumedPackage.name] &&
      !(packageFile.devDependencies || {})[consumedPackage.name]
    ) {
      console.log(
        chalk[consumingPackageConfig.logColour](
          `[${consumingPackageConfig.name} > ${npmPackageSubDir}] ${consumedPackage.name} is not a dependency of ${consumingPackageConfig.name} > ${npmPackageSubDir}, skipping`,
        ),
      );
      return;
    }

    const depType = (packageFile.dependencies || {})[consumedPackage.name]
      ? 'dependencies'
      : 'devDependencies';
    const fromVersion = packageFile[depType][consumedPackage.name];
    if (
      this.isSemverString(toVersion) &&
      this.isSemverString(fromVersion) &&
      !this.extractSemverType(toVersion).length
    ) {
      toVersion = `${this.extractSemverType(fromVersion)}${toVersion}`;
    }
    packageFile[depType][consumedPackage.name] = toVersion;
    fs.writeFileSync(
      packageFilePath,
      `${JSON.stringify(packageFile, null, 2).trim()}\n`,
    );
    console.log(
      chalk[consumingPackageConfig.logColour](
        `[${consumingPackageConfig.name} > ${npmPackageSubDir}] Updated version of ${consumedPackage.name} dependency from ${fromVersion} to ${toVersion}`,
      ),
    );
  },

  getCurrentPackageVersion(packageConfig) {
    const pathToFile = path.resolve(
      packageConfig.localRepoPath,
      'package.json',
    );
    console.log(pathToFile);
    const packageFile = require(pathToFile);
    console.log(packageFile.version);
    return packageFile.version;
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
          `[${packageConfig.displayName}] ${parentPackagePushMessage}`,
        ),
      );
    } catch (err) {
      packageConfig.actionsLog.push('Pushing failed');
    }
  },

  currentBranchLockItem: async function (
    consumingPackages,
    consumedPackages,
    branchLockArray,
  ) {
    const branchesMap = {};
    for (var packageConfig of consumingPackages.concat(consumedPackages)) {
      branchesMap[packageConfig.name] = (
        await packageConfig.git.branch()
      ).current;
    }
    const matchingBranchLockItem = branchLockArray.find((branchLockItem) => {
      for (var key in branchesMap) {
        if (!branchLockItem[key] || branchLockItem[key] !== branchesMap[key]) {
          return false;
        }
      }
      return true;
    });
    if (!matchingBranchLockItem) {
      throw `No branch lock entry matches the currently checkout branches of the included repos, which are as follows:\n${JSON.stringify(
        branchesMap,
        null,
        2,
      )}`;
    }
    return matchingBranchLockItem;
  },

  initialiseRepo: async function (packageConfig, branchLockItem) {
    const branch = branchLockItem[packageConfig.name];
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
      if (packageConfig.commit) {
        throw `[${packageConfig.displayName}] ${branch} and origin/${branch} have diverged. Either set commit to false for this package, or resolve the conflicts in the repo manually, before trying again.`;
      } else {
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.displayName}] ${branch} and origin/${branch} have diverged. This will need to be resolved before committing and pushing this repo. The script will continue, as commit is not set to true for this package.`,
          ),
        );
      }
    } else if (localCommits[0] === remoteCommits[0]) {
      // Local is up top date with remote
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] ${branch} is up to date with origin/${branch}.`,
        ),
      );
    } else if (
      localCommits.indexOf(remoteCommits[0]) > -1 &&
      remoteCommits.indexOf(localCommits[0]) < 0
    ) {
      // Local ahead of remote
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] ${branch} is ahead of origin/${branch} and can be pushed.`,
        ),
      );
    } else if (
      remoteCommits.indexOf(localCommits[0]) > -1 &&
      localCommits.indexOf(remoteCommits[0]) < 0
    ) {
      // Remote ahead of local
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] origin/${branch} is ahead of ${branch}.`,
        ),
      );
      if ((await packageConfig.git.status()).isClean()) {
        await packageConfig.git.pull();
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.displayName}] Pulled ${branch} branch.`,
          ),
        );
      } else {
        if (packageConfig.commit) {
          throw `[${packageConfig.displayName}] origin/${branch} is ahead of ${branch} but ${branch} has uncommitted changes. This must be resolved before continuing.`;
        } else {
          console.log(
            chalk[packageConfig.logColour](
              `[${packageConfig.displayName}] origin/${branch} is ahead of ${branch} but ${branch} has uncommitted changes. This will need to be resolved before committing and pushing this repo. The script will continue, as commit is not set to true for this package.`,
            ),
          );
        }
      }
    }
    console.log(
      chalk[packageConfig.logColour](
        `[${packageConfig.displayName}] ${branch} - initialisation complete.`,
      ),
    );
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
      const packageFilePath = this.mainPackageFilePath(packageConfig);
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
            `[${packageConfig.displayName}] Added tag ${newTag} to latest commit.`,
          ),
        );
      } catch (err) {
        packageConfig.actionsLog.push('Tagging failed');
      }
    } else {
      packageConfig.actionsLog.push('Tagging skipped');
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] Tag ${newTag} already exists.`,
        ),
      );
    }
    if (packageConfig.pushTags !== false) {
      try {
        await packageConfig.git.push(['--tags']);
        packageConfig.actionsLog.push('Pushing tags succeeded');
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.displayName}] Pushed tags.`,
          ),
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

  bumpVersionPaths(packageConfig) {
    return (packageConfig.packageFilesToUpdate || []).map((file) => {
      return path.resolve(packageConfig.localRepoPath, file);
    });
  },

  bumpVersion: async function (packageConfig) {
    if (!(packageConfig.releaseType || packageConfig.preReleaseType)) {
      return;
    }
    // Determine the new version number, based on prereleaseType, releaseType and the current version
    let newVersion;
    const mainPackageFilePath = this.mainPackageFilePath(packageConfig);
    const mainPackageFile = require(mainPackageFilePath);
    const status = await packageConfig.git.status();
    const hasChangesToCommit = status.files.length > 0;
    if (!hasChangesToCommit) {
      console.log(
        chalk[packageConfig.logColour](
          `[${packageConfig.displayName}] Not updating version in package.json as ther repo has no chnages to commit.`,
        ),
      );
      return;
    }
    const currentVersion = mainPackageFile.version;
    const currentVersionNumber = (currentVersion.match(/(\d+.\d+.\d+)/) ||
      [])[0];

    if (packageConfig.preReleaseType) {
      const suffix = `${packageConfig.preReleaseType}.${moment().format(
        'YYYYMMDDHHmm',
      )}`;
      newVersion = `${currentVersionNumber}-${suffix}`;
    } else {
      const releaseType = packageConfig.releaseType || 'patch';
      const releaseTypes = ['major', 'minor', 'patch'];
      const matchIndex = releaseTypes.indexOf(releaseType);
      const numbers = currentVersion.match(/(\d*)\.(\d*)\.(\d*)/);
      newVersion = releaseTypes
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
    }
    // Update the version in the relevant package.json files
    const pathsToUpdate = this.bumpVersionPaths(packageConfig);
    if (!pathsToUpdate.includes(mainPackageFilePath)) {
      pathsToUpdate.unshift(mainPackageFilePath);
    }
    pathsToUpdate
      .filter((filePath) => filePath.endsWith('package.json'))
      .forEach((filePath) => {
        const fileContents = require(filePath);
        fileContents.version = newVersion;
        fs.writeFileSync(
          filePath,
          `${JSON.stringify(fileContents, null, 2).trim()}\n`,
        );
        console.log(
          chalk[packageConfig.logColour](
            `[${packageConfig.displayName}] Updated version to ${fileContents.version} in ${filePath}.`,
          ),
        );
      });
    return mainPackageFile;
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
              !newVersionDefaultPackageFile[depType][dep],
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
      (pnpmDep) => pnpmDep.name === depName,
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
      path.resolve(dirPath, 'pnpm-workspace.yaml'),
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
    const packageFile = require(
      path.resolve(process.cwd(), filePath, 'package.json'),
    );
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
            final.pnpmLock.version.replace('link:', ''),
          );
          final.absolutePath = absolutePath;
          final.gitState = this.checkGitState(
            absolutePath,
            this.isMonoRepoWorkspace(filePath),
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

  extractSemverType(string) {
    if (typeof string !== 'string' || string.length === 0) return '';
    const s = string.trim();
    const first = s[0];
    if (first === '^' || first === '~') return first;
    return '';
  },

  extractSemverString(string) {
    const versionRegex = /.{0,1}[0-9]+\.[0-9]+\.[0-9]+/;
    if (!string.match(versionRegex)) {
      return false;
    }
    return string.match(versionRegex)[0];
  },

  isSemverString(string) {
    const versionRegex = /.{0,1}[0-9]+\.[0-9]+\.[0-9]+/;
    return versionRegex.test(string);
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
                package.resolution.commit || package.resolution.tarball,
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
            childPackage.children,
          ),
        };
  },

  pnpmLockAsJson(filePath) {
    const json = nodeSundries.yamlFileToJs(`${filePath}/pnpm-lock.yaml`);
    return Array.isArray(json) ? json[0] : json;
  },

  getLocalLinks(linkPath, acc = [], parent) {
    const locallyLinked = this.allPnpmDeps(linkPath).filter(
      (dep) => dep.linked,
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

const getGitInfo = require('git-repo-info');
const gitState = require('git-state');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

module.exports = function (environment, ENV, deps, localDevRepos) {
  if (environment === 'development' || environment === 'test') {
    ENV.dependencySummary = {};
    deps.forEach((dep) => {
      checkDep(dep, ENV);
    });
    console.log(
      `----------------------------------\n${chalk.magenta(
        `DEPENDENCY VERSIONS`
      )}\n`
    );
    console.log(ENV.dependencySummary);
    if (!ENV.symlinks) {
      console.log(`----------------------------------`);
    }

    if (ENV.symlinks) {
      console.log(
        `----------------------------------\n${chalk.magenta(
          `SYMLINKS DETECTED`
        )}\n`
      );
      console.log(ENV.symlinks);
      console.log(`----------------------------------`);
    }
    checkLocalDevRepos(localDevRepos);
  }
};

function checkLocalDevRepos(localDevRepos) {
  if (!localDevRepos) {
    return;
  }
  console.log(chalk.magenta(`LOCAL DEV REPO STATUS\n`));

  const output = {};
  localDevRepos.forEach((repo) => {
    const depName = path.basename(repo.path);

    output[depName] = {};
    let repoState;
    let parentName;

    if (gitState.isGitSync(repo.path)) {
      repoState = gitState.checkSync(repo.path);
      const gitInfo = getGitInfo(repo.path);
      let gitStatus = {};
      for (var key in repoState) {
        if (repoState[key] > 0) {
          gitStatus[key] = repoState[key];
        }
      }
      output[depName] = gitStatus || {};
      output[
        depName
      ].lastCommit = `${gitInfo.abbreviatedSha} "${gitInfo.commitMessage}"`;
    }
    if (repo.dependencyOf) {
      parentName = path.basename(repo.dependencyOf);
      const pathToDep = path.join(repo.dependencyOf, 'node_modules', depName);
      const stats = fs.lstatSync(pathToDep) || {};
      if (stats.isSymbolicLink()) {
        output[depName].symlinked = true;
      }
    }

    const depWarnings = [];
    if (output[depName].symlinked) {
      depWarnings.push(`is symlinked in ${parentName}`);
    }
    if (depWarnings.length) {
      console.log(
        chalk.red(`WARNING: ${depName} ${depWarnings.join(' and ')}.`)
      );
    }
  });
  console.log(output);
}

function isSymlink(path) {
  if (!path) {
    return;
  }
  if (!fs.existsSync(path)) {
    return;
  }
  const stats = fs.lstatSync(path);
  if (!stats) {
    return;
  }
  if (stats.isSymbolicLink()) {
    return true;
  }
}

function checkGitState(path) {
  if (!gitState.isGitSync(path)) {
    return '';
  }
  const repoState = gitState.checkSync(path);
  return `${repoState.dirty} dirty and ${repoState.untracked} untracked.`;
}

function installedMatchesRequired(packageFilePath, depName) {
  try {
    const parentPackageName = (packageFilePath.match(
      /.*?node_modules\/(.*?)\/package\.json/
    ) || [])[1];
    const packageFile = require(packageFilePath);
    const packageLockFilePath = `${process.cwd()}/package-lock.json`;
    const packageLockFile = require(packageLockFilePath);
    const packageDep =
      packageFile.devDependencies[depName] || packageFile.dependencies[depName];
    if (!packageDep) {
      return 'Not installed';
    }
    const packageLockListing =
      packageLockFile.packages[`node_modules/${depName}`] ||
      ((packageLockFile.packages[`node_modules/${parentPackageName}`] || {})
        .dependencies || {})[`node_modules/${depName}`];
    if (packageLockListing) {
      if (
        packageLockListing.resolved.split('#')[1] === packageDep.split('#')[1]
      ) {
        return packageLockListing.resolved.split('#')[1];
      }
      if (packageLockListing.version === packageDep.split('#')[1]) {
        return packageLockListing.version;
      }
      return {
        'package.json': packageDep.split('#')[1],
        'package-lock.json': `resolved === ${
          packageLockListing.resolved.split('#')[1]
        }, version === ${packageLockListing.version}`,
      };
    } else {
      console.log(`${depName} not in package-lock`);
    }
  } catch (err) {
    console.log(chalk.red(err));
  }
}

function checkDep(dep, ENV) {
  dep.children = dep.children || [];
  const pathToDep = `${process.cwd()}/node_modules/${dep.name}`;
  const appPackageFilePath = `${process.cwd()}/package.json`;
  const depPackageFilePath = `${pathToDep}/package.json`;
  if (isSymlink(pathToDep)) {
    ENV.symlinks = ENV.symlinks || [];
    const currentSymlink = {
      symlinkedDep: `${dep.name} (${checkGitState(pathToDep)})`,
      symlinkedChildren: [],
    };
    dep.children.forEach((child) => {
      const pathToChild = `${pathToDep}/node_modules/${child}`;
      if (isSymlink(pathToChild)) {
        currentSymlink.symlinkedChildren.push(
          `${child} (${checkGitState(pathToChild)})`
        );
      }
    });
    ENV.symlinks.push(currentSymlink);
  }
  ENV.dependencySummary[dep.name] = {};
  ENV.dependencySummary[dep.name] = installedMatchesRequired(
    appPackageFilePath,
    dep.name
  );
  dep.children.forEach((child) => {
    ENV.dependencySummary[child] = {};
    ENV.dependencySummary[child] = installedMatchesRequired(
      depPackageFilePath,
      child
    );
  });
}

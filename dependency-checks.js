const getGitInfo = require('git-repo-info');
const gitState = require('git-state');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const nodeSundries = require('node-sundries');
const util = require('util');

module.exports = function (environment, ENV, deps, localDevRepos) {
  try {
    console.log(
      `----------------------------------\n${chalk.magenta(
        `MAP OF LINKED DEPENDENCIES`
      )}\n`
    );
    console.log(
      util.inspect(
        filterProperties(getLocalLinks(process.cwd()), [
          'name',
          'absolutePath',
          'children',
        ]),
        {
          showHidden: false,
          depth: null,
          colors: true,
        }
      )
    );
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
      console.log(`----------------------------------`);

      checkLocalDevRepos(localDevRepos);
    }
  } catch (err) {
    console.log(chalk.red(err));
  }
};

function allPnpmDeps(filePath, depTypes = ['dependencies', 'devDependencies']) {
  const json = nodeSundries.yamlFileToJs(`${filePath}/pnpm-lock.yaml`);
  const packageFile = require(path.resolve(
    process.cwd(),
    filePath,
    'package.json'
  ));
  return depTypes.reduce((acc, depType) => {
    const obj = json[depType];
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
        final.gitState = checkGitState(absolutePath);
      }
      acc.push(final);
    }
    return acc;
  }, []);
}

function installedMatchesRequired(item) {
  if (item.linked) {
    return `Linked locally to ${item.absolutePath} ${item.gitState}`;
  }
  const pnpmLockVersion =
    item.pnpmLock.specifier.split('#')[1] || item.pnpmLock.specifier;
  const packageJsonVersion = item.packageJson.split('#')[1] || item.packageJson;
  if (pnpmLockVersion === packageJsonVersion) {
    return pnpmLockVersion;
  }
  return {
    pnpmLockVersion: pnpmLockVersion,
    packageJsonVersion: packageJsonVersion,
  };
}

function findPnpmDep(depName, filePath) {
  return allPnpmDeps(filePath).find((pnpmDep) => pnpmDep.name === depName);
}

function findPnpmDeps(depNames, filePath) {
  return depNames
    .map((depName) => findPnpmDep(depName, filePath))
    .filter((item) => item);
}

function getLocalLinks(linkPath, acc = [], parent) {
  const locallyLinked = allPnpmDeps(linkPath).filter((dep) => dep.linked);
  if (!locallyLinked.length) {
    return acc;
  }
  if (parent) {
    parent.children = locallyLinked;
  } else {
    acc = locallyLinked;
  }
  return locallyLinked.reduce((acc, link) => {
    return getLocalLinks(link.absolutePath, acc, link);
  }, acc);
}

function checkDep(dep, ENV) {
  const pnpmDep = findPnpmDep(dep.name, './');
  let childDeps = [];
  if (dep.children) {
    if (pnpmDep.linked) {
      childDeps = findPnpmDeps(dep.children, pnpmDep.absolutePath).map(
        (item) => {
          item.via = pnpmDep.absolutePath;
          return item;
        }
      );
    } else {
      childDeps = findPnpmDeps(dep.children, './');
    }
  }
  const final = {
    version: installedMatchesRequired(pnpmDep),
  };
  childDeps.forEach((childDep) => {
    final.children = final.children || {};
    final.children[childDep.name] = installedMatchesRequired(childDep);
  });
  ENV.dependencySummary[pnpmDep.name] = final;
}

function filterProperties(array, properties) {
  return array.map((item) => {
    const filteredItem = {};
    properties.forEach((prop) => {
      if (item[prop] !== undefined) {
        filteredItem[prop] = Array.isArray(item[prop])
          ? filterProperties(item[prop], properties)
          : item[prop];
      }
    });
    return filteredItem;
  });
}

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
    if (gitState.isGitSync(repo.path)) {
      repoState = gitState.checkSync(repo.path);
      const gitInfo = getGitInfo(repo.path);
      const gitStatus = {};
      for (const key in repoState) {
        if (repoState[key] > 0) {
          gitStatus[key] = repoState[key];
        }
      }
      output[depName] = gitStatus || {};
      output[
        depName
      ].lastCommit = `${gitInfo.abbreviatedSha} "${gitInfo.commitMessage}"`;
    }
  });
  console.log(output);
}

function checkGitState(path) {
  if (!gitState.isGitSync(path)) {
    return '';
  }
  const repoState = gitState.checkSync(path);
  return `${repoState.dirty} dirty and ${repoState.untracked} untracked.`;
}

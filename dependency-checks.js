const getGitInfo = require('git-repo-info');
const gitState = require('git-state');
const path = require('path');
const chalk = require('chalk');
const nodeSundries = require('node-sundries');
const util = require('util');
const lib = require('./index');

module.exports = function (environment, ENV, deps, localDevRepos) {
  try {
    const linkedDeps = filterProperties(getLocalLinks(process.cwd()), [
      // Thnis also defined the order of the props
      'name',
      'absolutePath',
      'gitState',
      'children',
    ]);
    if (linkedDeps.length) {
      console.log(
        `----------------------------------\n${chalk.magenta(
          'MAP OF LINKED DEPENDENCIES'
        )}\n`
      );
      console.log(
        util.inspect(linkedDeps, {
          showHidden: false,
          depth: null,
          colors: true,
        })
      );
    }

    if (environment === 'development' || environment === 'test') {
      ENV.dependencySummary = {};
      deps.forEach((dep) => {
        checkDep(dep, ENV);
      });

      console.log(
        `----------------------------------\n${chalk.magenta(
          'DEPENDENCY VERSIONS'
        )}\n`
      );
      console.log(
        util.inspect(ENV.dependencySummary, {
          showHidden: false,
          depth: null,
          colors: true,
        })
      );
      console.log('----------------------------------');

      checkLocalDevRepos(localDevRepos);
    }
  } catch (err) {
    console.log(chalk.red(err));
  }
};

function pnpmLockAsJson(filePath) {
  const json = nodeSundries.yamlFileToJs(`${filePath}/pnpm-lock.yaml`);
  return Array.isArray(json) ? json[0] : json;
}

function allPnpmDeps(filePath, depTypes = ['dependencies', 'devDependencies']) {
  const json = pnpmLockAsJson(filePath);
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

function specifiedMatchesInstalledDep(item) {
  if (!item) {
    return;
  }
  if (item.linked) {
    return `Linked locally to ${item.absolutePath} ${item.gitState}`;
  }
  const specified = extractVersion(item.pnpmLock.specifier);
  const installed = extractVersion(item.pnpmLock.version);
  return expectedVsFoundOutput(specified, installed);
}

function expectedVsFoundOutput(specified, installed) {
  if (
    extractSemverNumbers(specified) &&
    extractSemverNumbers(specified) === extractSemverNumbers(installed)
  ) {
    return extractSemverNumbers(installed);
  }
  if (specified === installed) {
    return installed;
  }

  return {
    specified: specified,
    installed: extractSemverNumbers(installed) || installed,
  };
}

function findPnpmDep(depName, filePath) {
  return allPnpmDeps(filePath).find((pnpmDep) => pnpmDep.name === depName);
}

function extractHash(string) {
  const hashRegex = /[0-9a-f]{40}/;
  if (!string.match(hashRegex)) {
    return false;
  }
  return string.match(hashRegex)[0];
}

function extractSemverString(string) {
  const versionRegex = /.{0,1}[0-9]+\.[0-9]+\.[0-9]+/;
  if (!string.match(versionRegex)) {
    return false;
  }
  return string.match(versionRegex)[0];
}

function extractSemverNumbers(string) {
  const versionRegex = /.{0,1}([0-9]+\.[0-9]+\.[0-9]+)/;
  if (!string.match(versionRegex)) {
    return false;
  }
  return string.match(versionRegex)[1];
}

function extractVersion(string) {
  if (extractHash(string)) {
    return extractHash(string);
  }
  if (extractSemverString(string)) {
    return extractSemverString(string);
  }
  return false;
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
  const final = {
    version: specifiedMatchesInstalledDep(pnpmDep),
  };

  if (dep.children) {
    final.children = processChildPackages(pnpmDep, dep.children);
  }
  ENV.dependencySummary[pnpmDep.name] = final;
}

function processChildPackages(parent, children) {
  const parentName = typeof parent === 'string' ? parent : parent.name;
  const final = {};
  if ((parent || {}).linked) {
    children.forEach((child) => {
      const keyName = typeof child === 'string' ? child : child.name;
      final[keyName] = processChildOfLinkedPackage(parent, child);
    });
  } else {
    children.forEach((child) => {
      const keyName = typeof child === 'string' ? child : child.name;
      final[keyName] = processChildPackage(parentName, child, './');
    });
  }
  return final;
}

function processChildOfLinkedPackage(pnpmDep, child) {
  const childDepName = typeof child === 'string' ? child : child.name;
  const childPnpmDep = findPnpmDep(childDepName, pnpmDep.absolutePath);
  childPnpmDep.via = pnpmDep.absolutePath;
  return typeof child === 'string'
    ? specifiedMatchesInstalledDep(childPnpmDep)
    : {
        version: specifiedMatchesInstalledDep(childPnpmDep),
        children: processChildPackages(childPnpmDep, child.children),
      };
}

function processChildPackage(parentDep, childPackage, filePath) {
  const childDepName =
    typeof childPackage === 'string' ? childPackage : childPackage.name;
  const json = pnpmLockAsJson(filePath);
  let parentPackage;
  const final = {};
  for (const key in json.packages) {
    if (key.indexOf(parentDep) > -1) {
      parentPackage = json.packages[key];
    }
  }
  for (const key in parentPackage.dependencies) {
    if (childDepName === key) {
      final.expected = extractVersion(parentPackage.dependencies[key]);
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
          ? extractHash(package.resolution.commit || package.resolution.tarball)
          : extractSemverString(key);
    }
  }
  return typeof childPackage === 'string'
    ? expectedVsFoundOutput(final.expected, final.found)
    : {
        version: expectedVsFoundOutput(final.expected, final.found),
        children: processChildPackages(childDepName, childPackage.children),
      };
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
      output[depName].currentBranch = gitInfo.branch;
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

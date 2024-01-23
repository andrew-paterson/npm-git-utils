const fs = require('fs');
const chalk = require('chalk');
const merge = require('lodash.merge');
const semver = require('semver');
module.exports = function (
  packageFileToEditPath,
  newVersionDefaultPackageFilePath,
  currentVersionDefaultPackageFilePath,
  opts = {}
) {
  const packageFileToEdit = JSON.parse(
    fs.readFileSync(packageFileToEditPath, 'utf8')
  );
  const newVersionDefaultPackageFile = JSON.parse(
    fs.readFileSync(newVersionDefaultPackageFilePath, 'utf8')
  );
  const currentVersionDefaultPackageFile = JSON.parse(
    fs.readFileSync(currentVersionDefaultPackageFilePath, 'utf8')
  );

  ['dependencies', 'devDependencies'].forEach((depType) => {
    if (packageFileToEdit[depType]) {
      opts.removePackages.forEach((dep) => {
        delete packageFileToEdit[depType][dep];
      });
    }
  });
  console.log(
    chalk.magenta(
      'THE FOLLOWING PACKAGES WILL BE REMOVED BY FORCE AS THEY ARE IN opts.removePackages'
    )
  );
  console.log(opts.removePackages);

  const nonDefaultDeps = getUniqueDependencies(
    packageFileToEdit,
    merge({}, currentVersionDefaultPackageFile, newVersionDefaultPackageFile)
  );

  const removedDefaults = getUniqueDependencies(
    currentVersionDefaultPackageFile,
    newVersionDefaultPackageFile
  );
  console.log(
    chalk.magenta(
      'THE FOLLOWING DEFAULT PACKAGES WILL BE REMOVED AS THEY ARE NOT INCLUDED IN THE NEW VERSION'
    )
  );
  console.log(removedDefaults);

  if (opts.overwriteFromReference) {
    opts.overwriteFromReference.forEach((key) => {
      packageFileToEdit[key] = newVersionDefaultPackageFile[key];
    });
    console.log(
      chalk.magenta(
        'THE FOLLOWING KEYS WERE UPDATED TO MATCH THE PACKAGE FILE IN THE NEW VERSION'
      )
    );
    console.log(opts.overwriteFromReference);
  }
  console.log(
    chalk.magenta(
      'THE FOLLOWING PACKAGES ARE NOT DEFAULTS AND MIGHT NEED UPGRADING'
    )
  );
  console.log(nonDefaultDeps);

  if (opts.versionUpdateReferenceFilePaths) {
    const highestVersions = {};
    opts.versionUpdateReferenceFilePaths.forEach((path) => {
      const packageFile = JSON.parse(fs.readFileSync(path, 'utf8'));
      ['dependencies', 'devDependencies'].forEach((depType) => {
        if (packageFile[depType]) {
          Object.keys(packageFile[depType]).forEach((dep) => {
            if (packageFile[depType][dep].indexOf('#') < 0) {
              if (!highestVersions[dep]) {
                highestVersions[dep] = packageFile[depType][dep];
              } else {
                highestVersions[dep] = highestVersion(
                  highestVersions[dep],
                  packageFile[depType][dep]
                );
              }
            }
          });
        }
      });
    });
    const packageUpgradeFeedback = [];
    ['dependencies', 'devDependencies'].forEach((depType) => {
      Object.keys(nonDefaultDeps[depType]).forEach((dep) => {
        if (highestVersions[dep]) {
          const updatedVersion = highestVersion(
            highestVersions[dep],
            nonDefaultDeps[depType][dep]
          );
          if (updatedVersion !== nonDefaultDeps[depType][dep]) {
            packageUpgradeFeedback.push({
              dep: dep,
              oldVersion: nonDefaultDeps[depType][dep],
              newVersion: updatedVersion,
            });
            nonDefaultDeps[depType][dep] = updatedVersion;
          }
        }
      });
    });
    console.log(
      chalk.magenta(
        'THE FOLLOWING PACKAGES WERE UPDATED TO THE HIGHEST VERSION FOUND IN THE opts.versionUpdateReferenceFilePaths'
      )
    );
    console.log(packageUpgradeFeedback);
  }

  ['dependencies', 'devDependencies'].forEach((depType) => {
    if (packageFileToEdit[depType]) {
      packageFileToEdit[depType] = merge(
        {},
        newVersionDefaultPackageFile[depType],
        nonDefaultDeps[depType]
      );
      packageFileToEdit[depType] = sortObjectKeys(packageFileToEdit[depType]);
    }
  });

  if (opts.dryRun) {
    console.log(
      chalk.yellow(
        'DRY RUN - NO CHANGES MADE. UPDATED PACKAGE FILE WILL LOOK LIKE THIS:'
      )
    );
    console.log(packageFileToEdit);

    return;
  } else {
    fs.writeFileSync(
      packageFileToEditPath,
      JSON.stringify(packageFileToEdit, null, 2)
    );
    console.log(chalk.green(`Updated ${packageFileToEditPath}`));
  }
};

function highestVersion(string1, string2) {
  const version1 = string1.replace(/[^0-9.]/g, '');
  const version2 = string2.replace(/[^0-9.]/g, '');
  return semver.gt(version2, version1) ? string2 : string1;
}

function getUniqueDependencies(
  packageFileToCheck,
  newVersionDefaultPackageFile
) {
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
    }
  });
  return uniqueDeps;
}

function sortObjectKeys(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = obj[key];
      return result;
    }, {});
}

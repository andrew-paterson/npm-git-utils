const fs = require('fs');
const semver = require('semver');
const chalk = require('chalk');

module.exports = function (packageFileToEdit, referencepackageFile) {
  const pkg1 = JSON.parse(fs.readFileSync(packageFileToEdit, 'utf8'));
  const pkg2 = JSON.parse(fs.readFileSync(referencepackageFile, 'utf8'));

  ['dependencies', 'devDependencies'].forEach((depType) => {
    if (pkg1[depType] && pkg2[depType]) {
      Object.keys(pkg1[depType]).forEach((dep) => {
        if (pkg2[depType][dep]) {
          const version1 = pkg1[depType][dep].replace(/[^0-9.]/g, '');
          const version2 = pkg2[depType][dep].replace(/[^0-9.]/g, '');
          if (semver.gt(version2, version1)) {
            pkg1[depType][dep] = pkg2[depType][dep];
          }
        }
      });
    }
  });

  fs.writeFileSync(packageFileToEdit, JSON.stringify(pkg1, null, 2));
  console.log(chalk.green(`Updated ${packageFileToEdit}`));
};

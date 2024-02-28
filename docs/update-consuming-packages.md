Commits and pushes the code in an NPM package which is a dependency of one or more other node projects.

Updates the SHA of the dependency in the package.json files in one or more consuminmg NPM projects.

Optionally commits and pushed the consuming NPM projects.

The two items in the `localConsumingPackages` array below show the full list of possible options.

```
const updateConsumingPackages = require('npm-git-utils/update-consuming-packages');
const options = {
  dependentPackage: {
    localRepoPath: './shared-dependency', // Path to the git repo of the NPM dependency.
    commitMessage: 'Update styles', // Commit message for the NPM dependency
    amendLatestCommit: null, // Optional, default = false. can be true or 'no-edit'. If present, the commit option is forced to true. If true, the latest commit will be amended with the changes, and the commmit message will be updated to the value of the commitMessage option. if 'no-edit', latest commit will be amended with the changes, and the commit message will not be changed.
    logColour: 'magenta', // Optional, default = 'cyan'. Colour of the console log messages relating to the NPM dependency.
  },
  localConsumingPackages: [
    {
      localRepoPath: './consuming-project-1', // Path to the git repo of the consuming package.
      skip: true, // Optional, default = false. If true, the package will be skipped.
      commit: true, // Optional, default = false. If true, the repo .
      commitMessage: 'Update shared-dependency', // Optional, but required if commit or push is true, unless the amendLatestCommit is set to 'no-edit'
      push: true, // Optional, default = false. If true, the repo will be pushed to origin. Forces the commit option to true if true.
      releaseType: 'minor', // Optional, default = 'patch', can be 'minor' or 'major' as well. Defines how the version is bumped in the consuming package.json file. Overridden by preReleaseType if both are present.
      logColour: 'green', // Optional, default = 'cyan'. Colour of the console log messages relating to the NPM dependency.
      customEditsFunc: async function updateDepsTest( packageConfig, dependentPackage, dependentPackageVersion) {} // Optional. Must be an async function, which runs after the consuming package's package.json file has been updates, but before the consuming package is committed.
    },
    {
      localRepoPath: './consuming-project-2',
      npmPackageSubDir: './apps/nested-npm-project', // Optional, default = null. Required if the NPM project which consumes the dependency is nested within the git repo. Speficies the path to the NPM project relative to the localRepoPath.
      commitMessage: 'Amedmed latest commit',
      amendLatestCommit: true, // Optional, default = false. can be true or 'no-edit'. If present, the commit option is forced to true. If true, the latest commit will be amended with the changes, and the commmit message will be updated to the value of the commitMessage option. if 'no-edit', latest commit will be amended with the changes, and the commit message will not be changed.
      preleaseType: 'dev', // Opional, can be any string. If present, the version will be bumped in the consuming package.json file, by simply appending the string and datetime to the current version. If present, the releaseType option is ignored.
      tag: true // Optional. If true, the commit will be tagged with the current version in package.json
    },
    {
      localRepoPath: '.consuming-project-3',
      amendLatestCommit: 'no-edit',
      releaseType: 'major'
    },
  ],
  branchLock: [ // Required. An array of objects. Each object must have the basename of the depenency and all consuming packages as keys. The value of each key must be the name of the branch which the package must be on in order to be updated. The uil will determine the current brnach of he depency project, find the associated branchLock item and ensure hat he corresponding branch ios checked out for each consuming package.
    {
      'shared-dependency': 'production',
      'consuming-project-1': 'production',
      'consuming-project-2': 'production',
      'consuming-project-3': 'production',
    },
    {
      'shared-dependency': 'develop',
      'consuming-project-1': 'develop',
      'consuming-project-2': 'develop',
      'consuming-project-3': 'develop',
    },
  ],
};
updateConsumingPackages(options);
```

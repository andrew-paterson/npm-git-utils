Optionally commits and pushes the code of one or more NPM package which are dependencies of a single, consuming NPM project.

Updates the commit SHA of each updated dependency in the package.json file in the consuminmg NPM project.

Optionally commits and pushed the consuming NPM project.

```
const updateLocalDependencies = require('npm-dependency-utils/update-local-dependents');
const options = = {
  parentPackage: {
    localRepoPath: './consuming-npm-project', // Path to the git repo of the NPM dependency.
    commitMessage: 'Update styles', // Commit message for the NPM dependency
    commit: true, // Optional, default = false. If true, the repo .
    push: true,  // Optional, default = false. If true, the repo will be pushed to origin. Forces the commit option to true if true.
    amendLatestCommit: null, // Optional, default = false. can be true or 'no-edit'. If present, the commit option is forced to true. If true, the latest commit will be amended with the changes, and the commmit message will be updated to the value of the commitMessage option. if 'no-edit', latest commit will be amended with the changes, and the commit message will not be changed.
    logColour: 'magenta', // Optional, default = 'cyan'. Colour of the console log messages relating to the NPM dependency.
  },
  localDependencies: [
    {
      localRepoPath: './npm-dependency-1', // Path to the git repo of the consuming package.
      skip: true, // Optional, default = false. If true, the package will be skipped.
      commit: true, // Optional, default = false. If true, the repo .
      commitMessage: 'Update consuming-npm-project', // Optional, but required if commit or push is true, unless the amendLatestCommit is set to 'no-edit'
      push: true, // Optional, default = false. If true, the repo will be pushed to origin. Forces the commit option to true if true.
      logColour: 'green', // Optional, default = 'cyan'. Colour of the console log messages relating to the NPM dependency.
    },
    {
      localRepoPath: './npm-dependency-2',
      commitMessage: 'Amedmed latest commit',
      amendLatestCommit: true, // Optional, default = false. can be true or 'no-edit'. If present, the commit option is forced to true. If true, the latest commit will be amended with the changes, and the commmit message will be updated to the value of the commitMessage option. if 'no-edit', latest commit will be amended with the changes, and the commit message will not be changed.
    },
    {
      localRepoPath: '.npm-dependency-3',
      amendLatestCommit: 'no-edit',
    },
  ],
  branchLock: [ // Required. An array of objects. Each object must have the basename of the depenency and all consuming packages as keys. The value of each key must be the name of the branch which the package must be on in order to be updated. The uil will determine the current brnach of he depency project, find the associated branchLock item and ensure hat he corresponding branch ios checked out for each consuming package.
    {
      'consuming-npm-project': 'production',
      'npm-dependency-1': 'production',
      'npm-dependency-2': 'production',
      'npm-dependency-3': 'production',
    },
    {
      'consuming-npm-project': 'develop',
      'npm-dependency-1': 'develop',
      'npm-dependency-2': 'develop',
      'npm-dependency-3': 'develop',
    },
  ],
};
updateLocalDependencies(options);
```

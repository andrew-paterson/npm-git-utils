Commits and pushes the code in an NPM package which is a dependency of one or more other node projects.

Updates the SHA of the dependency in the package.json files in one or more consuminmg NPM projects.

Optionally commits and pushed the consuming NPM projects.

The two items in the `localConsumingPackages` array below show the full list of possible options.

```javascript
const updateConsumingPackages = require('npm-git-utils/update-consuming-packages');
const options = {
  consumedPackages: [{
    localRepoPath: './shared-dependency', // Path to the git repo of the NPM dependency.
    packageFilesToUpdate: null, // Optional. An array of paths to package.json files relative to the project root. If passed, each of these files, as well as the main package.json file for the project will have their version bumped, where relevant- that is, where releaseType or preReleaseType are passed.
    commitMessage: 'Update styles', // Commit message for the NPM dependency
    amendLatestCommit: null, // Optional, default = false. can be true or 'no-edit'. If present, the commit option is forced to true. If true, the latest commit will be amended with the changes, and the commmit message will be updated to the value of the commitMessage option. if 'no-edit', latest commit will be amended with the changes, and the commit message will not be changed.
    logColour: 'magenta', // Optional, default = 'cyan'. Colour of the console log messages relating to the NPM dependency.
    commit: true, // Optional, default = false Whether or not to commit any uncommitted changes. If false, the script will continue witht eh most recent commit.
    releaseType: 'minor', // Optional, default = 'patch', can be 'minor' or 'major' as well. Defines how the version is bumped in the consuming package.json file. Overridden by preReleaseType if both are present.
    preReleaseType: 'dev', // Opional, can be any string. If present, the version will be bumped in the consuming package.json file, by simply appending the string and datetime to the current version. If present, the releaseType option is ignored.
    tag: true, // Optional. If true, the commit will be tagged with the current version in package.json
    customEditsFunc: async (
        packageConfig,
      ) => {}, // Optional. Must be an async function. If present, it will be the last function to run before the repo changes are committed. It will always run after any automated edits, such as version bumps.
    versionFn(consumedPackage, consumingPackage, fromVersion, fromVersionSemverType) {
      return `***Version***`.
    } // Optional. By default, after pushing the dependent package, the script will fetch the updated version in the package.json file int he consumedPackage, and update the version of the dependency to that version the consumung package, keeping the semver ^ or ~ char ig it is present. If this function is passed, the result of this function will be used instead. An example of where this is useful is if you source code and build branches are different.
  }],
  consumingPackages: [
    {
      localRepoPath: './consuming-project-1', // Path to the git repo of the consuming package.
      npmPackageSubDirs: ['./apps/nested-npm-project'], // Optional, default = ['./']. Required if the NPM project/s which consume the dependency are nested within the git repo. Specifies an array of paths to the consuming NPM projects relative to the localRepoPath. Note that the script will never add a dependency to a package file which does not already have it.
      commitMessage: 'Amended latest commit',
      skip: true, // Optional, default = false. If true, the package will be skipped.
      commit: true, // Optional, default = false. If false, forces push to false as well.
      commitMessage: 'Update shared-dependency', // Optional, but required if commit or push is true, unless the amendLatestCommit is set to 'no-edit'
      amendLatestCommit: null, // Optional, default = false. can be true or 'no-edit'. Will be forced to false if the commit option is not true. If true, the latest commit will be amended with the changes, and the commmit message will be updated to the value of the commitMessage option. If 'no-edit', latest commit will be amended with the changes, and the commit message will not be changed.
      push: true, // Optional, default = false. If true, the repo will be pushed to origin. If amendlatestCommit is truthy, push will happen with the force option.
      releaseType: 'minor', // Optional, default = 'patch', can be 'minor' or 'major' as well. Defines how the version is bumped in the consuming package.json file. Overridden by preReleaseType if both are present.
      preReleaseType: 'dev', // Opional, can be any string. If present, the version will be bumped in the consuming package.json file, by simply appending the string and datetime to the current version. If present, the releaseType option is ignored.
      tag: true, // Optional. If true, the commit will be tagged with the current version in package.json
      packageFilesToUpdate: null, // Optional. An array of paths to package.json files relative to the project root. If passed, each of these files, as well as the main package.json file for the project will have their version bumped, where relevant- that is, where releaseType or preReleaseType are passed.
      pushTags: false, // Optional, default = true. Whether to push the tags after tagging
      logColour: 'green', // Optional, default = 'cyan'. Colour of the console log messages relating to the NPM dependency.
       customEditsFunc: async (
        packageConfig,
      ) => {}, // Optional. Must be an async function. If present, it will be the last function to run before the repo changes are committed. It will always run after any automated edits, such as version bumps.
    },
    {
      localRepoPath: '.consuming-project-3',
      amendLatestCommit: 'no-edit',
      releaseType: 'major',
    },
  ],
  branchLock: [
    // Required. An array of objects. Each object must have the basename of the depenency and all consuming packages as keys. The value of each key must be the name of the branch which the package must be on in order to be updated. The uil will determine the current brnach of he depency project, find the associated branchLock item and ensure hat he corresponding branch ios checked out for each consuming package.
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

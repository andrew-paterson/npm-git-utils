const chalk = require('chalk');
const path = require('path');
const getGitInfo = require('git-repo-info');
const gitState = require('git-state');

module.exports = function (localDevRepos) {
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
      output[depName].lastCommit = `${gitInfo.sha} "${gitInfo.commitMessage}"`;
    }
  });
  console.log(output);
};

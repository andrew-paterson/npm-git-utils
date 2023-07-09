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
};

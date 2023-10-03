const chalk = require('chalk');
const lib = require('./index');
const simpleGit = require('simple-git');
const logColours = ['blueBright', 'magenta', 'cyan', 'grey', 'yellow', 'white'];

module.exports = async function (repoPaths) {
  const repos = repoPaths.map((repoPath, index) => {
    return {
      logColour: logColours[index],
      main: {
        path: repoPath.main,
        git: simpleGit({
          baseDir: repoPath.main,
        }),
      },
      fork: {
        path: repoPath.fork,
        git: simpleGit({
          baseDir: repoPath.fork,
        }),
      },
    };
  });
  for (const repo of repos) {
    try {
      const currentBranch = (await repo.main.git.branch()).current;
      const upstreamBranch = `upstream/${currentBranch}`;
      await repo.fork.git.fetch('upstream');
      console.log(chalk[repo.logColour](`[${repo.fork.path}] Fetched upstream.`));
      await repo.fork.git.checkout(currentBranch);
      const currentLatestCommit = await lib.latestCommit(repo.fork);
      console.log(chalk[repo.logColour](`[${repo.fork.path}] Checkout out ${currentBranch}.`));
      await repo.fork.git.mergeFromTo(`upstream/${currentBranch}`, currentBranch);
      const newLatestCommit = await lib.latestCommit(repo.fork);
      if (currentLatestCommit.hash === newLatestCommit.hash) {
        console.log(chalk[repo.logColour](`[${repo.fork.path}] No upstream changes to merge in ${currentBranch}.`));
        console.log(chalk[repo.logColour]('---------------------------'));
        continue;
      }
      console.log(chalk[repo.logColour](`[${repo.fork.path}] Merged ${upstreamBranch} into ${currentBranch}`));
      console.log(chalk[repo.logColour](`    -- ${currentLatestCommit.hash} => ${newLatestCommit.hash}.`));
      console.log(chalk[repo.logColour](`    -- ${currentLatestCommit.message} => ${newLatestCommit.message}.`));
      await repo.fork.git.push();
      console.log(chalk[repo.logColour](`[${repo.fork.path}] Pushed ${currentBranch}`));
      console.log(chalk[repo.logColour]('---------------------------'));
    } catch (err) {
      console.log(chalk.red(err));
    }
  }
};

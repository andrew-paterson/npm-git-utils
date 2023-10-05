# Sync forks

Given an array of main repos and their local forks, the script will

- checkout the branch of the forked repo which corresponds to the curently checked out branch in the main repo.
- run `git fetch` from the forked repo.
- merge the changes from the upstream branch into the forked branch

* run `git push` in the foprked repo, witht he same branch chdcked out.

## Example

```
const syncForks = require('npm-git-utils/sync-forks');
const repos = [
  {
    main: 'path-to-local-copy-of-upstream-repo',
    fork: 'path-to-local-copy-of-forked-repo'
  },
];

syncForks(repos);
```

## Branch tracking

The upstream chnages will not be fetched if the forked branch is not correctly tracking the upstream branch.

To check this, from the forked repo, run

`git remote show upstream`

Any branches which are correctly tracking their upstream versions will be listed under `Local branch configured for 'git pull':`

```
Local branch configured for 'git pull':
    master merges with remote master
```

If a branch is not listed here, have it track its upstream correctly by running the following

`git branch --set-upstream-to=upstream/develop develop`

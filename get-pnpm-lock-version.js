const fs = require('fs');

module.exports = function (depName) {
  const pnpmLock = fs.readFileSync(`${process.cwd()}/pnpm-lock.yaml`, 'utf-8');
  const regex = new RegExp(
    `\n\\s*${depName}:\n\\s*specifier:.*?\n\\s*version: (.*?)\n`
  );
  return pnpmLock.match(regex)[1];
};

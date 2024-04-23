const lib = require('./index');

module.exports = function (ENV, deps) {
  ENV.dependencySummary = {};
  deps.forEach((dep) => {
    lib.checkDep(dep, ENV);
  });
};

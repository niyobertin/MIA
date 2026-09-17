const nativewindBabel = require('nativewind/babel');

module.exports = function(api) {
  api.cache(true);
  const nativewindPlugins = nativewindBabel();
  return {
    presets: ['babel-preset-expo'],
    plugins: nativewindPlugins.plugins,
  };
};

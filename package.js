Package.describe({
  name: 'coagmano:stylus',
  version: '1.2.0',
  summary: 'Stylus plugin with plugins from mquandalle:stylus. Compatible with Meteor 1.4 and \'ecmascript\'',
  git: 'https://github.com/coagmano/meteor-stylus.git'
});

Package.registerBuildPlugin({
  name: 'compileStylusBatch',
  use: ['ecmascript@0.12.0', 'caching-compiler@1.2.0'],
  sources: [
    'plugin/compile-stylus.js'
  ],
  npmDependencies: {
    stylus: 'https://github.com/meteor/stylus/tarball/bb47a357d132ca843718c63998eb37b90013a449', // fork of 0.54.5
    nib: '1.1.2',
    jeet: '7.1.0',
    rupture: '0.6.2',
    axis: '0.4.3',
    typographic: '2.9.3',
    'autoprefixer-stylus': '0.13.0',
    glob: '7.1.2',
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'coagmano:stylus', 'test-helpers', 'templating', 'ecmascript']);
  api.addFiles([
    'stylus_tests.html',
    'stylus_tests.styl',
    'stylus_tests.import.styl',
    'stylus_tests.js',
    'test_files/direct/direct.import.styl',
    'test_files/indirect/1/indirect1.import.styl',
    'test_files/indirect/2/indirect2.import.styl',
    'test_files/multiple/multiple1.import.styl',
    'test_files/multiple/multiple2.import.styl',
    'test_files/multiple/multiple3.import.styl',
  ], 'client');
});

Package.describe({
  name: 'lamoglia:publish-aggregation',
  version: '0.0.10',
  summary: 'Easily publish collection aggregations.',
  git: 'https://github.com/lamoglia/publish-aggregation',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('meteor');
  api.use('ecmascript@0.8.2');
  api.addFiles('lib/PublicationIdManager/PublicationIdManager.js');
  api.addFiles('lib/Utils/Utils.js');
  api.addFiles('lib/aggregator.js');
  api.export('buildAggregator');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('ecmascript@0.8.2');
  api.addFiles('lib/PublicationIdManager/tests/PublicationIdManager.test.js', 'client');
  api.addFiles('lib/Utils/tests/Utils.test.js', 'client');
});

Npm.depends({
  'hash-sum': '1.0.2',
  'lodash': '4.17.4'
});

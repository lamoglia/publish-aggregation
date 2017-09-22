Package.describe({
  name: 'lamoglia:publish-aggregation',
  version: '0.0.5',
  summary: 'Easily publish collection aggregations.',
  git: 'https://github.com/lamoglia/publish-aggregation',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('meteor');
  api.use(['ecmascript@0.8.2']);
  api.addFiles(['aggregator.js'], 'server');
  api.export(['buildAggregator']);
});

Npm.depends({
  'hash-sum': '1.0.2',
  'lodash': '4.17.4'
});

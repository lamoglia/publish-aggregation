import { getPipelineMatchStage } from '../Utils';

Tinytest.add('getPipelineMatchStage extracts the match stage of a pipeline', function( test ) {
  const pipeline = [
    { $match: { tenant: 2 } },
    { $group: { _id: { firewall_id: '$firewall_id', severity: '$query_severity' }, count: { $sum: 1 } } },
  ];
  const matchStage = getPipelineMatchStage(pipeline);
  test.equal(matchStage, { $match: { tenant: 2 } });
});

Tinytest.add('getPipelineMatchStage returns false if there is no match stage', function( test ) {
  const pipeline = [
    { $group: { _id: { firewall_id: '$firewall_id', severity: '$query_severity' }, count: { $sum: 1 } } },
  ];
  const matchStage = getPipelineMatchStage(pipeline);
  test.equal(matchStage, false);
});

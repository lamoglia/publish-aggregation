## Publish Aggregation

Easily publish reactive aggregations from meteor collections.

### Installation
`
meteor add lamoglia:publish-aggregation
`

### Usage

Import `buildAggregator` function:

`
import { buildAggregator } from 'meteor/lamoglia:publish-aggregation';
`

Name and publish the aggregation pipeline:


`
Meteor.publish('publication.name', buildAggregator(Collection, pipeline, options));
`

### Default options

```javascript
const defaultOptions = {
  collectionName: collection._name,
  transform: false,
  singleValueField: false,
  pastPeriod: false,
  rateLimitMillis: 500,
};
```

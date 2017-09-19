## Publish Aggregation

Easily publish reactive aggregations from meteor collections.

### Installation
```bash
meteor add lamoglia:publish-aggregation
```

### Usage

Import `buildAggregator` function:

```javascript
import { buildAggregator } from 'meteor/lamoglia:publish-aggregation';
```

Name and publish the aggregation pipeline:


```javascript
Meteor.publish('publication.name', buildAggregator(collection, pipelineCreator, options));
```

Subscribe from client

```javascript
Meteor.subscribe('publication.name');
```

Now your Mini Mongo will receive live updates from the server with your aggregated data under the collection with name provided by `options.collectionName`, or the provided collection name if this option was not set.

### Parameters

- **collection**: *Mongo.Collection* - The collection to extract the data from.
- **pipelineCreator**: *Function* - Function that returns the pipeline for the aggregation query. It is a function instead of a simple array so it is possible to provide dynamic parameters such as the current logged user (`Meteor.userId()`). For more info about aggregation pipelines, see [MongoDB docs](https://docs.mongodb.com/manual/core/aggregation-pipeline/).
- **options**: *Object* - An optional object with options, as described below:

#### Options

The `options` object has the following properties:

- **collectionName**: *String* - The name of the collection under which the results will appear on MiniMongo. If not set, it will default to the provided collection name.
- **transform**: *Function* - Transformation function that receives each document from the aggregation result and outputs a reshaped object. Set false if no transformation is required.
- **singleValueField**: *String* - If you are publishing a result with a single changing field like a count or sum, provide the name of this field for improved performance: changes will be published only if this specific field is modified. If your aggregation pipeline returns only one field other than the aggregation _id, it will be used by default.
- **pastPeriod**: *Object* - Object with the following properties:
 - **field**: *String* - The ISODate field name from the collection.
 - **millis**: *Number* - Number of milliseconds from now to filter the results. Example: if you want only the documents with the field timestamp with values at most one hour from now, set "pastPeriod.field" to "timestamp" and "pastPeriod.millis" to 3600000.
- **rateLimitMillis**: *Number* - Value representing the maximum frequency of execution of the aggregation query, in milliseconds. If you possibly have many changes in the aggregated collection, it is best to provide a rate limit to avoid the query being run more times than your user can see the changes on screen. Set 0 to disable rate limiting.

You should set the **pastPeriod** property only if you want to filter the collection's documents by some (ISODate) field within the last N milliseconds. Common use cases: "Publish the number of messages by sender received in the last 24h", "Publish the sum of 'critical' alerts started in the last hour". If isn't set, no filtering will be done.


### Default options

- **collectionName** - The name of provided collection (Meteor.Collection._name)
- **transform** - false
- **singleValueField** - false
- **pastPeriod** - false
- **rateLimitMillis** - 500

### Example

Given a `Messages` collection in the following format

```javascript
{
  _id: '59c119f2666c4eb0a695d8dd',
  sender_id: '59c119d5666c4eb0a695d8db',
  sender_name: 'Rick',
  recipient_id: '59c119d6666c4eb0a695d8dc',
  message: 'And that\'s the wayyyyyy the news goes!',
  sent_at: ISODate("2017-09-14T20:22:41.188Z"),
}
```

To publish a collection with the number of messages received in the past 24 hours grouped by sender:

```javascript
import { Meteor } from 'meteor/meteor';
import { buildAggregator } from 'meteor/lamoglia:publish-aggregation';
import { Messages } from '../../messages/messages.js';

const pipelineCreator = () => ([
  { $match: { recipient_id: { $eq: Meteor.userId() } } },
  { $group: { _id: { sender_id: '$sender_id' }, count: { $sum: 1 }, sender_name: { $first: '$sender_name' } } },
]);

const options = {
  collectionName: 'messagecounts',
  transform: (doc) => ({ ...doc, sender_id: doc._id.sender_id }),
  singleValueField: 'count',
  pastPeriod: {
    millis: 60 * 60 * 1000,
    field: 'sent_at',
  },
};

Meteor.publish('message.counts.by.sender', buildAggregator(Messages, pipelineCreator, options));
```

Subscribe to this publication on the client

```javascript
Meteor.subscribe('message.counts.by.sender');
```

The resulting collection (messagecounts) will have the following format at mini mongo:

```javascript
{
  _id: '59c119f3666c4eb0a695d8df',
  sender_id: '59c119d5666c4eb0a695d8db',
  sender_name: 'Rick',
  count: 42,
}
```

If no messages are sent within an hour, the counter will eventually get down to zero.

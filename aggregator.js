import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { _ } from 'underscore';
import sum from 'hash-sum';

const getOid = (hashToOidMap, doc) => {
  const oidKey = sum(doc._id);
  if (!hashToOidMap[oidKey]) {
    hashToOidMap[oidKey] = new Mongo.ObjectID()._str;
  }
  return hashToOidMap[oidKey];
};

const getPipelineMatchStage = (pipeline) => {
  const matchStages = pipeline.filter((stage) => stage.hasOwnProperty('$match'));
  if (matchStages.length) {
    return matchStages[0];
  }
  return false;
};

buildAggregator = (collection, pipelineCreator, options) => function() {
  const self = this;

  const defaultOptions = {
    collectionName: collection._name,
    transform: false,
    singleValueField: false,
    pastPeriod: false,
    rateLimitMillis: 500,
  };
  const currentOptions = _.extendOwn(defaultOptions, options);

  const pipeline = pipelineCreator();
  const hashToOidMap = {};
  const published = {};
  const rawCollection = collection.rawCollection();
  const aggregateQuery = Meteor.wrapAsync(rawCollection.aggregate, rawCollection);
  
  let ready = false;
  let interval = false;
  let oldestDocument = false;
  let matchStage = false;

  if (currentOptions.pastPeriod) {
    matchStage = getPipelineMatchStage(pipeline);
    if (!matchStage) {
      pipeline.splice(0, 0, { $match: { } });
      matchStage = getPipelineMatchStage(pipeline);
    }
  }

  if (!currentOptions.singleValueField && Object.keys(pipeline.$group).length === 2) {
    currentOptions.singleValueField = Object.keys(pipeline.$group).filter(k => k !== '_id')[0];
  }

  let update = () => {
    const { collectionName, transform, pastPeriod, singleValueField } = currentOptions;

    if (pastPeriod) {
      matchStage.$match[pastPeriod.field] = { $gt: new Date(Date.now() - pastPeriod.millis) };
    }
    const results = aggregateQuery(pipeline);
    const resultOids = [];
    results.forEach((doc) => {
      const oid = getOid(hashToOidMap, doc);
      resultOids.push(oid);
      const transformedDocument = transform ? transform(doc) : doc;

      if (published[oid]) {
        if (singleValueField) {
          if (published[oid] !== doc[singleValueField]) {
            self.changed(collectionName, oid, transformedDocument);
            published[oid] = doc[singleValueField];
          }
        } else {
          published[oid] = true;
        }
      } else {
        self.added(collectionName, oid, transformedDocument);
        if (singleValueField) {
          published[oid] = doc[singleValueField];
        } else {
          published[oid] = true;
        }
      }
    });

    Object.keys(published).forEach((oid) => {
      if (resultOids.indexOf(oid) < 0) {
        self.removed(collectionName, oid);
        delete published[oid];
      }
    });
  };

  if (currentOptions.rateLimitMillis) {
    update = _.throttle(Meteor.bindEnvironment(update), currentOptions.rateLimitMillis);
  }

  const updateTimeout = () => {
    const currentTime = new Date();
    const query = {};
    const queryOptions = {
      limit: 1,
      fields: {},
      sort: {},
    };

    query[currentOptions.pastPeriod.field] = { $gt: new Date(currentTime.getTime() - currentOptions.pastPeriod.millis) };
    queryOptions.fields[currentOptions.pastPeriod.field] = 1;
    queryOptions.sort[currentOptions.pastPeriod.field] = 1;

    oldestDocument = collection.find(query, queryOptions).fetch()[0];

    if (interval) {
      Meteor.clearInterval(interval);
    }

    if (oldestDocument) {
      const nextUpdate = currentOptions.pastPeriod.millis - (currentTime.getTime() - oldestDocument[currentOptions.pastPeriod.field].getTime());
      interval = Meteor.setTimeout(() => {
        update();
        updateTimeout();
      }, nextUpdate);
    }
  };

  const handle = collection.find({}).observeChanges({
    added(id, doc) {
      if (!ready) {
        return;
      }
      if (currentOptions.pastPeriod && ((Date.now() - doc[currentOptions.pastPeriod.field].getTime()) > currentOptions.pastPeriod.millis)) {
        return;
      }
      if (currentOptions.pastPeriod && (!oldestDocument || (doc[currentOptions.pastPeriod.field] < oldestDocument[currentOptions.pastPeriod.field]))) {
        updateTimeout();
      }
      update();
    },
    removed(id) {
      if (currentOptions.pastPeriod && (!oldestDocument || (id === oldestDocument._id))) {
        updateTimeout();
      }
      update();
    },
  });

  update();

  if (currentOptions.pastPeriod) {
    updateTimeout();
  }

  self.ready();
  ready = true;

  self.onStop(() => {
    if (interval) {
      Meteor.clearInterval(interval);
    }
    handle.stop();
  });
};

import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { _ } from 'lodash';
import PublicationIdManager from './PublicationIdManager/PublicationIdManager.js';
import { getPipelineMatchStage } from './Utils/Utils.js';


buildAggregator = (collection, pipelineCreator, options) => function() {
  const self = this;
  const idManager = new PublicationIdManager();

  const defaultOptions = {
    collectionName: collection._name,
    observeChangesFilter: {},
    transform: false,
    singleValueField: false,
    pastPeriod: false,
    rateLimitMillis: 500,
    republishOnChange: false,
  };
  const currentOptions = _.assign(defaultOptions, options);

  let pipeline = pipelineCreator();
  let published = {};
  let updateHandle = false;
  const rawCollection = collection.rawCollection();
  const aggregateQuery = Meteor.wrapAsync(rawCollection.aggregate, rawCollection);

  let ready = false;
  let interval = false;
  let oldestDocument = false;
  let matchStage = false;

  const getOid = (doc) => idManager.getOid(doc);

  const unpublishAll = () => {
    Object.keys(published).forEach((oid) => {
      self.removed(currentOptions.collectionName, oid);
    });
    published = {};
    hashToOidMap = {};
  };

  if (!currentOptions.singleValueField && Object.keys(pipeline.$group).length === 2) {
    currentOptions.singleValueField = Object.keys(pipeline.$group).filter(k => k !== '_id')[0];
  }

  let update = () => {
    if (!pipeline) {
      return;
    }
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
        idManager.removeOid(oid);
      }
    });
  };

  if (currentOptions.rateLimitMillis) {
    update = _.throttle(Meteor.bindEnvironment(update), currentOptions.rateLimitMillis);
  }

  const updateTimeout = () => {
    const currentTime = new Date();
    const query = matchStage.$match || {};
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

  const updatePipeline = () => {
    if (interval) {
      Meteor.clearInterval(interval);
      interval = false;
    }
    unpublishAll();
    pipeline = pipelineCreator();
    if (currentOptions.pastPeriod) {
      if (pipeline) {
        matchStage = getPipelineMatchStage(pipeline);
        if (!matchStage) {
          pipeline.splice(0, 0, { $match: { } });
          matchStage =  { $match: { } };
        }
      }
    }

    update();
    if (currentOptions.pastPeriod) {
      updateTimeout();
    }
  };

  if(currentOptions.republishOnChange){
    updateHandle = currentOptions.republishOnChange.apply(this).observeChanges({
      added() {
        updatePipeline();
      },
      removed() {
        updatePipeline();
      },
      changed() {
        updatePipeline();
      },
    });
  }

  const handle = collection.find(currentOptions.observeChangesFilter).observeChanges({
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

  updatePipeline();

  self.ready();
  ready = true;

  self.onStop(() => {
    if (interval) {
      Meteor.clearInterval(interval);
    }
    if (updateHandle) {
      updateHandle.stop();
    }
    handle.stop();
  });
};

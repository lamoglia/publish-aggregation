import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { _ } from 'lodash';
import PublicationIdManager from './PublicationIdManager/PublicationIdManager.js';
import { getPipelineMatchStage } from './Utils/Utils.js';


buildAggregator = (collection, pipelineCreator, options) => function () {
  const self = this;
  const idManager = new PublicationIdManager();

  const defaultOptions = {
    collectionName: collection._name,
    observeChangesFilter: false,
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
  let handle = false;

  const unpublishAll = () => {
    update.cancel();
    updateTimeout.cancel();
    Object.keys(published).forEach((oid) => {
      self.removed(currentOptions.collectionName, oid);
    });
    published = {};
    idManager.reset();
  };

  if (!currentOptions.singleValueField && Object.keys(pipeline.$group).length === 2) {
    currentOptions.singleValueField = Object.keys(pipeline.$group).filter((k) => k !== '_id')[0];
  }

  let update = () => {
    if (!pipeline) {
      return;
    }
    const {
      collectionName, transform, pastPeriod, singleValueField,
    } = currentOptions;

    if (pastPeriod) {
      matchStage.$match[pastPeriod.field] = { $gt: new Date(Date.now() - pastPeriod.millis) };
    }
    const results = aggregateQuery(pipeline);
    const resultOids = [];
    results.forEach((doc) => {
      const oid = idManager.getOid(doc);
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

  update = _.throttle(Meteor.bindEnvironment(update), currentOptions.rateLimitMillis);

  let updateTimeout = () => {
    if (!currentOptions.pastPeriod) {
      return;
    }
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
      Meteor.clearTimeout(interval);
    }

    if (oldestDocument) {
      const nextUpdate = currentOptions.pastPeriod.millis - (currentTime.getTime() - oldestDocument[currentOptions.pastPeriod.field].getTime());
      interval = Meteor.setTimeout(() => {
        update();
        updateTimeout();
      }, nextUpdate);
    }
  };

  updateTimeout = _.throttle(Meteor.bindEnvironment(updateTimeout), currentOptions.rateLimitMillis);

  const updatePipeline = () => {
    if (interval) {
      Meteor.clearTimeout(interval);
      interval = false;
    }
    if (handle) {
      handle.stop();
    }

    unpublishAll();
    pipeline = pipelineCreator();
    if (currentOptions.pastPeriod) {
      if (pipeline) {
        matchStage = getPipelineMatchStage(pipeline);
        if (!matchStage) {
          pipeline.splice(0, 0, { $match: { } });
          matchStage = { $match: { } };
        }
      }
    }

    if(currentOptions.observeChangesFilter){
      handle = updateMainObserver(currentOptions.observeChangesFilter());
    }
    update();
    updateTimeout();
  };

  if (currentOptions.republishOnChange) {
    updateHandle = currentOptions.republishOnChange.apply(this).observeChanges({
      added() {
        if (!ready) {
          return;
        }
        updatePipeline();
      },
      removed() {
        if (!ready) {
          return;
        }
        updatePipeline();
      },
      changed() {
        if (!ready) {
          return;
        }
        updatePipeline();
      },
    });
  }

  updateMainObserver = (query) => collection.find(query).observeChanges({
    added(id, doc) {
      if (!ready || update.pending && updateTimeout.pending) {
        return;
      }
      if (currentOptions.pastPeriod && ((Date.now() - doc[currentOptions.pastPeriod.field].getTime()) > currentOptions.pastPeriod.millis)) {
        return;
      }
      if (!oldestDocument || (currentOptions.pastPeriod && (doc[currentOptions.pastPeriod.field] < oldestDocument[currentOptions.pastPeriod.field]))) {
        updateTimeout();
      }
      update();
    },
    removed(id) {
      if (!ready || (update.pending && updateTimeout.pending)) {
        return;
      }
      if (!oldestDocument || (id === oldestDocument._id)) {
        updateTimeout();
      }
      update();
    },
  });

  updatePipeline();

  self.ready();
  ready = true;

  self.onStop(() => {
    update.cancel();
    updateTimeout.cancel();
    if (interval) {
      Meteor.clearTimeout(interval);
    }
    if (updateHandle) {
      updateHandle.stop();
    }
    handle.stop();
  });
};

import { Mongo } from 'meteor/mongo';
import sum from 'hash-sum';

class PublicationIdManager {
  constructor(){
    this.oidToHashMap = {};
    this.hashToOidMap = {};
  }

  getOid = (doc) => {
    const oidKey = sum(doc._id);
    if (!this.hashToOidMap[oidKey]) {
      this.hashToOidMap[oidKey] = new Mongo.ObjectID()._str;
      this.oidToHashMap[this.hashToOidMap[oidKey]] = oidKey;
    }
    return this.hashToOidMap[oidKey];
  }

  removeOid = (oid) => {
    const hash = this.oidToHashMap[oid];
    delete this.hashToOidMap[hash];
    delete this.oidToHashMap[oid];
  }

  reset = () => {
    this.oidToHashMap = {};
    this.hashToOidMap = {};
  }
}

export default PublicationIdManager;

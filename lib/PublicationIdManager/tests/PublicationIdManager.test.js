import PublicationIdManager from '../PublicationIdManager';

Tinytest.add('PublicationIdManager generates the same id for the same object?', function( test ) {
  let idManager = new PublicationIdManager();
  let doc = { _id: 'a40o98yh488ghy4o8rga', 'devid': "TRLL" };
  test.equal( idManager.getOid(doc), idManager.getOid(doc) );
});

Tinytest.add('PublicationIdManager generates a different id for the same object if the old id was removed?', function( test ) {
  let idManager = new PublicationIdManager();
  let doc = { _id: 'a40o98yh488ghy4o8rga', 'devid': "TRLL" };
  const oid = idManager.getOid(doc);
  idManager.removeOid(oid);
  const newOid = idManager.getOid(doc);

  test.notEqual(oid, newOid);
});

Tinytest.add('PublicationIdManager generates a different id for the same object if it was reset?', function( test ) {
  let idManager = new PublicationIdManager();
  let doc = { _id: 'a40o98yh488ghy4o8rga', 'devid': "TRLL" };
  const oid = idManager.getOid(doc);
  idManager.reset();
  const newOid = idManager.getOid(doc);

  test.notEqual(oid, newOid);
});

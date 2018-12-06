import { inject as service } from '@ember/service';
import Adapter from 'ember-data/adapter';

import {
  buildCollectionName,
  buildRefFromPath,
  flattenDocSnapshotData,
} from 'ember-cloud-firestore-adapter/utils/parser';
import RealtimeTracker from 'ember-cloud-firestore-adapter/utils/realtime-tracker';

/**
 * @class CloudFirestore
 * @namespace Adapter
 * @extends DS.Adapter
 */
export default Adapter.extend({
  /**
   * @type {Ember.Service}
   */
  firebase: service(),

  /**
   * @type {Object}
   */
  firestoreSettings: { timestampsInSnapshots: true },

  /**
   * @type {string}
   */
  referenceKeyName: 'referenceTo',

  /**
   * @override
   */
  defaultSerializer: 'cloud-firestore',

  /**
   * @override
   */
  init(...args) {
    this._super(...args);

    if (this.firestoreSettings) {
      const db = this.firebase.firestore();

      db.settings(this.firestoreSettings);
    }

    this.set('realtimeTracker', new RealtimeTracker());
  },

  /**
   * @override
   */
  generateIdForRecord(store, type) {
    const db = this.firebase.firestore();
    const collectionName = buildCollectionName(type);

    return db.collection(collectionName).doc().id;
  },

  /**
   * @override
   */
  async createRecord(store, type, snapshot) {
    const docRef = this.buildCollectionRef(type, snapshot.adapterOptions).doc(snapshot.id);
    const batch = this.buildWriteBatch(docRef, snapshot);

    await batch.commit();

    return this.serialize(snapshot, { includeId: true });
  },

  /**
   * @override
   */
  async updateRecord(store, type, snapshot) {
    const db = this.firebase.firestore();
    const docRef = db.collection(buildCollectionName(type.modelName)).doc(snapshot.id);
    const batch = this.buildWriteBatch(docRef, snapshot);

    await batch.commit();

    return this.serialize(snapshot, { includeId: true });
  },

  /**
   * @override
   */
  async deleteRecord(store, type, snapshot) {
    const db = this.firebase.firestore();
    const docRef = db.collection(buildCollectionName(type.modelName)).doc(snapshot.id);
    const batch = db.batch();

    batch.delete(docRef);
    this.addIncludeToWriteBatch(batch, snapshot.adapterOptions);

    return batch.commit();
  },

  /**
   * @override
   */
  async findRecord(store, type, id, snapshot = {}) {
    return new Promise((resolve) => {
      const docRef = this.buildCollectionRef(type, snapshot.adapterOptions).doc(id);
      const unsubscribe = docRef.onSnapshot((docSnapshot) => {
        if (this.getAdapterOptionConfig(snapshot, 'isRealTime')) {
          this.realtimeTracker.trackFindRecordChanges(type.modelName, docRef, store);
        }

        unsubscribe();
        resolve(flattenDocSnapshotData(docSnapshot));
      });
    });
  },

  /**
   * @override
   */
  async findAll(store, type, sinceToken, snapshotRecordArray) {
    return new Promise((resolve) => {
      const db = this.firebase.firestore();
      const collectionRef = db.collection(buildCollectionName(type.modelName));
      const unsubscribe = collectionRef.onSnapshot(async (querySnapshot) => {
        if (this.getAdapterOptionConfig(snapshotRecordArray, 'isRealTime')) {
          this.realtimeTracker.trackFindAllChanges(type.modelName, collectionRef, store);
        }

        unsubscribe();

        const records = await Promise.all(querySnapshot.docs.map(docSnapshot => (
          this.findRecord(store, type, docSnapshot.id)
        )));

        resolve(records);
      });
    });
  },

  /**
   * @override
   */
  async findBelongsTo(store, snapshot, url, relationship) {
    const type = { modelName: relationship.type };
    const urlNodes = url.split('/');
    const id = urlNodes.pop();

    return this.findRecord(store, type, id, {
      adapterOptions: {
        isRealTime: relationship.options.isRealTime,

        buildReference(db) {
          return buildRefFromPath(db, urlNodes.join('/'));
        },
      },
    });
  },

  /**
   * @override
   */
  async findHasMany(store, snapshot, url, relationship) {
    return new Promise((resolve) => {
      const collectionRef = this.buildHasManyCollectionRef(store, snapshot, url, relationship);
      const unsubscribe = collectionRef.onSnapshot(async (querySnapshot) => {
        if (relationship.options.isRealTime) {
          this.realtimeTracker.trackFindHasManyChanges(
            snapshot.modelName,
            snapshot.id,
            relationship,
            collectionRef,
            store,
          );
        }

        unsubscribe();

        const requests = this.findHasManyRecords(store, relationship, querySnapshot);
        const records = await Promise.all(requests);

        resolve(records);
      });
    });
  },

  /**
   * @override
   */
  async query(store, type, query, recordArray) {
    return new Promise((resolve) => {
      const collectionRef = this.buildCollectionRef(type, query);
      const firestoreQuery = this.buildQuery(collectionRef, query);
      const unsubscribe = firestoreQuery.onSnapshot(async (querySnapshot) => {
        if (this.getAdapterOptionConfig(query, 'isRealTime')) {
          this.realtimeTracker.trackQueryChanges(firestoreQuery, recordArray, query.queryId);
        }

        unsubscribe();

        const records = await Promise.all(this.findQueryRecords(
          store,
          type,
          query,
          querySnapshot,
        ));

        resolve(records);
      });
    });
  },

  /**
   * @param {DS.Model} type
   * @param {Object} [adapterOptions={}]
   * @return {firebase.firestore.CollectionReference} Collection reference
   * @function
   * @private
   */
  buildCollectionRef(type, adapterOptions = {}) {
    const db = this.firebase.firestore();

    if (Object.prototype.hasOwnProperty.call(adapterOptions, 'buildReference')) {
      return adapterOptions.buildReference(db);
    }

    return db.collection(buildCollectionName(type.modelName));
  },

  /**
   * @param {firebase.firestore.WriteBatch} batch
   * @param {firebase.firestore.DocumentReference} docRef
   * @param {DS.Snapshot} snapshot
   * @function
   * @private
   */
  addDocRefToWriteBatch(batch, docRef, snapshot) {
    const data = this.serialize(snapshot);

    batch.set(docRef, data, { merge: true });
  },

  /**
   * @param {firebase.firestore.WriteBatch} batch
   * @param {Object} [adapterOptions={}]
   * @function
   * @private
   */
  addIncludeToWriteBatch(batch, adapterOptions = {}) {
    const db = this.firebase.firestore();

    if (Object.prototype.hasOwnProperty.call(adapterOptions, 'include')) {
      adapterOptions.include(batch, db);
    }
  },

  /**
   * @param {firebase.firestore.DocumentReference} docRef
   * @param {DS.Snapshot} snapshot
   * @return {firebase.firestore.WriteBatch} Batch instance
   * @function
   * @private
   */
  buildWriteBatch(docRef, snapshot) {
    const db = this.firebase.firestore();
    const batch = db.batch();

    this.addDocRefToWriteBatch(batch, docRef, snapshot);
    this.addIncludeToWriteBatch(batch, snapshot.adapterOptions);

    return batch;
  },

  /**
   * @param {firebase.firestore.CollectionReference} collectionRef
   * @param {Object} [option={}]
   * @param {Model.<*>} [record]
   * @return {firebase.firestore.Query} Query
   * @function
   * @private
   */
  buildQuery(collectionRef, option = {}, record) {
    if (Object.prototype.hasOwnProperty.call(option, 'filter')) {
      return option.filter(collectionRef, record);
    }

    return collectionRef;
  },

  /**
   * @param {DS.Store} store
   * @param {DS.Snapshot} snapshot
   * @param {string} url
   * @param {Object} relationship
   * @return {firebase.firestore.CollectionReference|firebase.firestore.Query} Reference
   * @function
   * @private
   */
  buildHasManyCollectionRef(store, snapshot, url, relationship) {
    const db = this.firebase.firestore();
    const cardinality = snapshot.type.determineRelationshipType(relationship, store);
    let collectionRef;

    if (cardinality === 'manyToOne') {
      const inverse = snapshot.type.inverseFor(relationship.key, store);
      const collectionName = buildCollectionName(snapshot.modelName);
      const reference = db.collection(collectionName).doc(snapshot.id);

      collectionRef = db.collection(url).where(inverse.name, '==', reference);
    } else if (Object.prototype.hasOwnProperty.call(relationship.options, 'buildReference')) {
      collectionRef = relationship.options.buildReference(db, snapshot.record);
    } else {
      collectionRef = buildRefFromPath(db, url);
    }

    return this.buildQuery(collectionRef, relationship.options, snapshot.record);
  },

  /**
   * @param {DS.Store} store
   * @param {Object} relationship
   * @param {firebase.firestore.QuerySnapshot} querySnapshot
   * @return {Array} Has many record requests
   * @function
   * @private
   */
  findHasManyRecords(store, relationship, querySnapshot) {
    return querySnapshot.docs.map((docSnapshot) => {
      const type = { modelName: relationship.type };
      const referenceTo = docSnapshot.get(this.referenceKeyName);

      if (referenceTo && referenceTo.firestore) {
        return this.findRecord(store, type, referenceTo.id, {
          adapterOptions: {
            isRealTime: relationship.options.isRealTime,

            buildReference() {
              return referenceTo.parent;
            },
          },
        });
      }

      return this.findRecord(store, type, docSnapshot.id, {
        adapterOptions: { isRealTime: relationship.options.isRealTime },
      });
    });
  },

  /**
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @param {Object} option
   * @param {firebase.firestore.QuerySnapshot} querySnapshot
   * @return {Array.<Promise>} Find record promises
   * @function
   * @private
   */
  findQueryRecords(store, type, option, querySnapshot) {
    return querySnapshot.docs.map((docSnapshot) => {
      const referenceTo = docSnapshot.get(this.referenceKeyName);

      if (referenceTo && referenceTo.firestore) {
        const request = this.findRecord(store, type, referenceTo.id, {
          adapterOptions: {
            isRealTime: option.isRealTime,

            buildReference() {
              return referenceTo.parent;
            },
          },
        });

        return request;
      }

      return this.findRecord(store, type, docSnapshot.id, { adapterOptions: option });
    });
  },

  /**
   * @param {DS.Snapshot} snapshot
   * @param {string} prop
   * @return {*} Value of adapter option config
   * @function
   * @private
   */
  getAdapterOptionConfig(snapshot, prop) {
    try {
      return snapshot.adapterOptions[prop];
    } catch (error) {
      return null;
    }
  },
});

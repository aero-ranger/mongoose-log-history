require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - saveWholeDoc ObjectId field preservation', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
      organisation: mongoose.Schema.Types.ObjectId,
      creator: mongoose.Schema.Types.ObjectId,
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'OrderSaveWholeDocOid',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      saveWholeDoc: true,
    });

    Order = mongoose.model('OrderSaveWholeDocOid', orderSchema);
    LogHistory = getLogHistoryModel('OrderSaveWholeDocOid', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('stores _id as ObjectId (not Buffer) in updated_doc on create', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const doc = await Order.create({ status: 'pending', organisation: orgId });
    await wait();

    const log = await LogHistory.findOne({ model_id: doc._id, change_type: 'create' });
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc._id instanceof mongoose.Types.ObjectId).toBe(true);
    expect(log.updated_doc._id.toString()).toBe(doc._id.toString());
  });

  it('stores ObjectId reference fields as ObjectId (not Buffer) in updated_doc on create', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const creatorId = new mongoose.Types.ObjectId();
    const doc = await Order.create({ status: 'pending', organisation: orgId, creator: creatorId });
    await wait();

    const log = await LogHistory.findOne({ model_id: doc._id, change_type: 'create' });
    // updated_doc comes from doc.toObject() — all fields are present
    expect(log.updated_doc.organisation instanceof mongoose.Types.ObjectId).toBe(true);
    expect(log.updated_doc.organisation.toString()).toBe(orgId.toString());
    expect(log.updated_doc.creator instanceof mongoose.Types.ObjectId).toBe(true);
    expect(log.updated_doc.creator.toString()).toBe(creatorId.toString());
  });

  it('stores _id as ObjectId in original_doc on update', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const doc = await Order.create({ status: 'pending', organisation: orgId });
    await LogHistory.deleteMany({});

    doc.status = 'shipped';
    await doc.save();
    await wait();

    const log = await LogHistory.findOne({ model_id: doc._id, change_type: 'update' });
    // original_doc is fetched with select(trackedPaths), but _id is always included
    expect(log.original_doc._id instanceof mongoose.Types.ObjectId).toBe(true);
    expect(log.original_doc._id.toString()).toBe(doc._id.toString());
  });

  it('stores _id as ObjectId (not Buffer) in updated_doc on update', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const doc = await Order.create({ status: 'pending', organisation: orgId });
    await LogHistory.deleteMany({});

    doc.status = 'shipped';
    await doc.save();
    await wait();

    const log = await LogHistory.findOne({ model_id: doc._id, change_type: 'update' });
    // updated_doc comes from doc.toObject() — all fields are present
    expect(log.updated_doc._id instanceof mongoose.Types.ObjectId).toBe(true);
    expect(log.updated_doc._id.toString()).toBe(doc._id.toString());
    expect(log.updated_doc.organisation instanceof mongoose.Types.ObjectId).toBe(true);
    expect(log.updated_doc.organisation.toString()).toBe(orgId.toString());
  });

  it('ObjectId in updated_doc is not a plain object with a Buffer id property', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const doc = await Order.create({ status: 'pending', organisation: orgId });
    await wait();

    const log = await LogHistory.findOne({ model_id: doc._id, change_type: 'create' });
    const storedOrg = log.updated_doc.organisation;
    // The old bug turned ObjectId into { id: <Buffer>, _bsontype: 'ObjectId' } via deepClone
    expect(storedOrg instanceof mongoose.Types.ObjectId).toBe(true);
    expect(Object.getPrototypeOf(storedOrg)).not.toBe(Object.prototype);
  });
});

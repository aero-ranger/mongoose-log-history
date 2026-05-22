require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Schema Getter Transformations', () => {
  let OrderGetter;
  let LogHistoryGetter;

  beforeAll(() => {
    const schema = new mongoose.Schema({
      status: {
        type: String,
        get: (v) => (v ? v.toUpperCase() : v),
      },
    });
    schema.set('toObject', { getters: true });

    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderGetter',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });

    OrderGetter = mongoose.model('OrderGetter', schema);
    LogHistoryGetter = getLogHistoryModel('OrderGetter', true);
  });

  afterEach(async () => {
    await OrderGetter.deleteMany({});
    await LogHistoryGetter.deleteMany({});
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('does not log a false-positive update when a getter-transformed field is unchanged', async () => {
    const order = await OrderGetter.create({ status: 'pending' });
    await order.save();
    await wait();

    const logs = await LogHistoryGetter.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });

  it('logs the getter-transformed from_value and to_value when a field actually changes', async () => {
    const order = await OrderGetter.create({ status: 'pending' });
    order.status = 'done';
    await order.save();
    await wait();

    const logs = await LogHistoryGetter.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs[0].field_name).toBe('status');
    expect(logs[0].logs[0].from_value).toBe('PENDING');
    expect(logs[0].logs[0].to_value).toBe('DONE');
  });
});

describe('mongoose-log-history plugin - Default Value on Missing Field', () => {
  let OrderDefault;
  let LogHistoryDefault;

  beforeAll(() => {
    const schema = new mongoose.Schema({
      name: String,
      score: { type: Number, default: 0 },
    });

    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderDefault',
      trackedFields: [{ value: 'score' }],
      singleCollection: true,
    });

    OrderDefault = mongoose.model('OrderDefault', schema);
    LogHistoryDefault = getLogHistoryModel('OrderDefault', true);
  });

  afterEach(async () => {
    await OrderDefault.deleteMany({});
    await LogHistoryDefault.deleteMany({});
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('does not log a false-positive update when a new default-value field is absent in the stored document', async () => {
    // Simulate a document created before the `score` field was added to the schema
    const result = await OrderDefault.collection.insertOne({ name: 'legacy' });
    const legacyId = result.insertedId;

    const doc = await OrderDefault.findById(legacyId);
    await doc.save();
    await wait();

    const logs = await LogHistoryDefault.find({ model_id: legacyId, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });
});

describe('mongoose-log-history plugin - Nested Default Value on Missing Field', () => {
  let OrderNested;
  let LogHistoryNested;

  beforeAll(() => {
    const schema = new mongoose.Schema({
      name: String,
      config: {
        active: { type: Boolean, default: false },
      },
    });

    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderNested',
      trackedFields: [{ value: 'config.active' }],
      singleCollection: true,
    });

    OrderNested = mongoose.model('OrderNested', schema);
    LogHistoryNested = getLogHistoryModel('OrderNested', true);
  });

  afterEach(async () => {
    await OrderNested.deleteMany({});
    await LogHistoryNested.deleteMany({});
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('does not log a false-positive when a nested default field is absent and unchanged', async () => {
    const result = await OrderNested.collection.insertOne({ name: 'legacy' });
    const legacyId = result.insertedId;

    const doc = await OrderNested.findById(legacyId);
    await doc.save();
    await wait();

    const logs = await LogHistoryNested.find({ model_id: legacyId, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });

  it('logs an update when a nested missing field is explicitly set to its default value', async () => {
    const result = await OrderNested.collection.insertOne({ name: 'legacy' });
    const legacyId = result.insertedId;

    const doc = await OrderNested.findById(legacyId);
    doc.config.active = false;
    doc.markModified('config.active');
    await doc.save();
    await wait();

    const logs = await LogHistoryNested.find({ model_id: legacyId, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs[0].field_name).toBe('config.active');
    expect(logs[0].logs[0].to_value).toBe('false');
    expect(logs[0].logs[0].change_type).toBe('add');
  });
});

describe('mongoose-log-history plugin - Explicit Set of Default-Value Field', () => {
  let OrderActive;
  let LogHistoryActive;

  beforeAll(() => {
    const schema = new mongoose.Schema({
      name: String,
      active: { type: Boolean, default: false },
    });

    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderActive',
      trackedFields: [{ value: 'active' }],
      singleCollection: true,
    });

    OrderActive = mongoose.model('OrderActive', schema);
    LogHistoryActive = getLogHistoryModel('OrderActive', true);
  });

  afterEach(async () => {
    await OrderActive.deleteMany({});
    await LogHistoryActive.deleteMany({});
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('logs an update when a missing field is explicitly set to its default value', async () => {
    // Simulate a legacy document created before the `active` field was added to the schema
    const result = await OrderActive.collection.insertOne({ name: 'legacy' });
    const legacyId = result.insertedId;

    const doc = await OrderActive.findById(legacyId);
    doc.active = false;
    doc.markModified('active');
    await doc.save();
    await wait();

    const logs = await LogHistoryActive.find({ model_id: legacyId, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs[0].field_name).toBe('active');
    expect(logs[0].logs[0].to_value).toBe('false');
    expect(logs[0].logs[0].change_type).toBe('add');
  });
});

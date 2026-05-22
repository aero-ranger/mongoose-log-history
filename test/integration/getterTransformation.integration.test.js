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

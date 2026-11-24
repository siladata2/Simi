'use strict';

const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');

function makeMongoAuth(db, botNumber) {
  if (!db) throw new Error('MongoDB database is not connected');
  if (!/^\d{7,15}$/.test(String(botNumber))) throw new Error('Invalid bot number for MongoDB auth state');

  const collection = db.collection('wa_auth');
  const bot = String(botNumber);
  const mongoId = (key) => `${bot}:${key}`;

  async function read(key) {
    const doc = await collection.findOne({ _id: mongoId(key), bot });
    return doc ? JSON.parse(doc.value, BufferJSON.reviver) : null;
  }

  function writeOperation(key, value) {
    return {
      updateOne: {
        filter: { _id: mongoId(key), bot },
        update: {
          $set: {
            bot,
            key,
            value: JSON.stringify(value, BufferJSON.replacer),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    };
  }

  return {
    async state() {
      const creds = (await read('creds')) || initAuthCreds();
      const keys = {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(ids.map(async (id) => {
            let value = await read(`key:${type}:${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            result[id] = value;
          }));
          return result;
        },
        set: async (data) => {
          const operations = [];
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              const key = `key:${type}:${id}`;
              operations.push(value == null
                ? { deleteOne: { filter: { _id: mongoId(key), bot } } }
                : writeOperation(key, value));
            }
          }
          if (operations.length) await collection.bulkWrite(operations, { ordered: false });
        },
      };
      return { creds, keys };
    },

    saveCreds: async (creds) => collection.bulkWrite([writeOperation('creds', creds)]),

    hasSession: async () => Boolean(await collection.findOne(
      { _id: mongoId('creds'), bot },
      { projection: { _id: 1 } },
    )),

    clear: async () => collection.deleteMany({ bot }),
  };
}

module.exports = { makeMongoAuth };

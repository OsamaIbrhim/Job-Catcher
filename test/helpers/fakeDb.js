/**
 * test/helpers/fakeDb.js
 * -----------------------------------------------------------
 * A minimal in-memory stand-in for the MongoDB `db` handle, just
 * covering the subset of the driver's API this project's lib/*
 * modules use (findOne / updateOne / insertOne / deleteMany /
 * countDocuments / find, with _id-keyed documents and a small set
 * of comparison operators). Lets us test caching, dedup, and
 * cleanup logic without a real database.
 * -----------------------------------------------------------
 */

function matchesFilter(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];

    const isOperatorObject =
      condition && typeof condition === "object" && !(condition instanceof Date) && !Array.isArray(condition);

    if (!isOperatorObject) return value === condition;

    return Object.entries(condition).every(([op, opValue]) => {
      switch (op) {
        case "$lt":
          return value < opValue;
        case "$lte":
          return value <= opValue;
        case "$gt":
          return value > opValue;
        case "$gte":
          return value >= opValue;
        case "$eq":
          return value === opValue;
        case "$ne":
          return value !== opValue;
        default:
          throw new Error(`fakeDb: unsupported query operator "${op}"`);
      }
    });
  });
}

let autoId = 1;

export function createFakeDb() {
  const collections = new Map();

  function getStore(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  return {
    collection(name) {
      const store = getStore(name);
      return {
        async findOne(query = {}) {
          for (const doc of store.values()) {
            if (matchesFilter(doc, query)) return doc;
          }
          return null;
        },
        async updateOne(query, update, options = {}) {
          const existing = query._id !== undefined ? store.get(query._id) : undefined;
          if (!existing && !options.upsert) return;

          const id = query._id !== undefined ? query._id : `auto-${autoId++}`;
          const base = existing ? { ...existing } : { _id: id };
          if (update.$set) Object.assign(base, update.$set);
          if (update.$setOnInsert && !existing) Object.assign(base, update.$setOnInsert);

          store.set(id, base);
        },
        async insertOne(doc) {
          const id = doc._id !== undefined ? doc._id : `auto-${autoId++}`;
          store.set(id, { ...doc, _id: id });
        },
        async insertMany(docs) {
          for (const doc of docs) await this.insertOne(doc);
        },
        async deleteMany(filter = {}) {
          let deletedCount = 0;
          for (const [id, doc] of [...store.entries()]) {
            if (matchesFilter(doc, filter)) {
              store.delete(id);
              deletedCount++;
            }
          }
          return { deletedCount };
        },
        async countDocuments(filter = {}) {
          let count = 0;
          for (const doc of store.values()) {
            if (matchesFilter(doc, filter)) count++;
          }
          return count;
        },
        find(filter = {}) {
          const results = [...store.values()].filter((doc) => matchesFilter(doc, filter));
          return { toArray: async () => results };
        },
        async createIndex() {
          // no-op — indexes are a real-MongoDB concern
        },
      };
    },
  };
}

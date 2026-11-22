// In-memory stand-in for the parts of the `chrome` API the extension uses.
// Tests install it as `globalThis.chrome`, then drive it through the helpers
// below (`offscreen.respond`, `downloads.settle`, ...) and inspect what the
// code under test asked for (`sentMessages`, `badge`, `alarms.all`, ...).

function createStorageArea() {
  const data = new Map();
  return {
    async get(keys) {
      const wanted = [keys].flat();
      return Object.fromEntries(
        wanted.filter((key) => data.has(key)).map((key) => [key, data.get(key)]),
      );
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    },
    async remove(keys) {
      for (const key of [keys].flat()) data.delete(key);
    },
  };
}

export function createFakeChrome() {
  const fake = {
    sentMessages: [],
    badge: { text: '', color: null },
    storage: { local: createStorageArea(), session: createStorageArea() },

    alarms: {
      all: new Map(),
      async create(name, info) {
        fake.alarms.all.set(name, {
          name,
          scheduledTime: info.when ?? Date.now() + info.delayInMinutes * 60_000,
        });
      },
      async clear(name) {
        return fake.alarms.all.delete(name);
      },
      async get(name) {
        return fake.alarms.all.get(name);
      },
    },

    offscreen: {
      open: false,
      // What the offscreen document answers to the service worker's commands.
      respond: () => undefined,
      async createDocument() {
        fake.offscreen.open = true;
      },
      async closeDocument() {
        fake.offscreen.open = false;
      },
    },

    runtime: {
      listeners: [],
      async getContexts() {
        return fake.offscreen.open ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [];
      },
      async sendMessage(message) {
        fake.sentMessages.push(message);
        return message.target === 'offscreen' ? fake.offscreen.respond(message) : undefined;
      },
      onMessage: {
        addListener: (listener) => fake.runtime.listeners.push(listener),
      },
    },

    action: {
      async setBadgeText({ text }) {
        fake.badge.text = text;
      },
      async setBadgeBackgroundColor({ color }) {
        fake.badge.color = color;
      },
    },

    tabCapture: {
      async getMediaStreamId() {
        return 'stream-id';
      },
    },

    downloads: {
      requests: [],
      items: new Map(),
      // The state a new download is in when the code under test looks it up.
      initialState: 'in_progress',
      async download(options) {
        const id = fake.downloads.requests.push(options);
        fake.downloads.items.set(id, { id, state: fake.downloads.initialState });
        return id;
      },
      async search({ id }) {
        return fake.downloads.items.has(id) ? [fake.downloads.items.get(id)] : [];
      },
      /** Settles a download and returns the matching onChanged event. */
      settle(id, state) {
        fake.downloads.items.set(id, { id, state });
        return { id, state: { current: state } };
      },
    },
  };
  return fake;
}

/** Delivers `message` to the registered onMessage listeners, like Chrome does. */
export function dispatchMessage(fake, message) {
  return new Promise((resolve, reject) => {
    const handled = fake.runtime.listeners.some(
      (listener) => listener(message, {}, resolve) === true,
    );
    if (!handled) reject(new Error('No listener handled the message.'));
  });
}

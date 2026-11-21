// Persistent state. Nothing is kept in service worker variables, because the
// worker is suspended after about 30 seconds of inactivity.

const HEAR_KEY = 'hear';
const SAVE_KEYS = ['saving', 'downloadId'];

/** Whether the user wants to hear the tab while it is recorded. */
export const hearPreference = {
  async get() {
    const { [HEAR_KEY]: hear = false } = await chrome.storage.local.get(HEAR_KEY);
    return hear;
  },
  set(hear) {
    return chrome.storage.local.set({ [HEAR_KEY]: hear });
  },
};

/** Progress of saving a finished recording; cleared when the browser exits. */
export const saveSession = {
  async get() {
    const { saving = false, downloadId = null } =
      await chrome.storage.session.get(SAVE_KEYS);
    return { saving, downloadId };
  },
  begin() {
    return chrome.storage.session.set({ saving: true });
  },
  setDownloadId(downloadId) {
    return chrome.storage.session.set({ downloadId });
  },
  clear() {
    return chrome.storage.session.remove(SAVE_KEYS);
  },
};

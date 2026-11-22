// Persistent state. Nothing is kept in service worker variables, because the
// worker is suspended after about 30 seconds of inactivity.

const HEAR_KEY = 'hear';
const AUTO_STOP_SECONDS_KEY = 'autoStopSeconds';
const DEFAULT_AUTO_STOP_SECONDS = 60 * 60;
const SAVE_KEYS = ['saving', 'downloadId'];
const LAST_ERROR_KEY = 'lastError';

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

/** The duration the user last chose for the automatic stop, in seconds. */
export const autoStopPreference = {
  async get() {
    const { [AUTO_STOP_SECONDS_KEY]: seconds = DEFAULT_AUTO_STOP_SECONDS } =
      await chrome.storage.local.get(AUTO_STOP_SECONDS_KEY);
    return seconds;
  },
  set(seconds) {
    return chrome.storage.local.set({ [AUTO_STOP_SECONDS_KEY]: seconds });
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

/**
 * The last failure. It is stored rather than only sent to the popup, because
 * a recording can fail while the popup is closed; cleared when the browser
 * exits.
 */
export const lastError = {
  async get() {
    const { [LAST_ERROR_KEY]: message = null } =
      await chrome.storage.session.get(LAST_ERROR_KEY);
    return message;
  },
  set(message) {
    return chrome.storage.session.set({ [LAST_ERROR_KEY]: message });
  },
  clear() {
    return chrome.storage.session.remove(LAST_ERROR_KEY);
  },
};

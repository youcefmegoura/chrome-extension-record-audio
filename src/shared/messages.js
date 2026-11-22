// Messaging contract shared by the three extension contexts (service worker,
// offscreen document, popup). Every message carries a `target`, because
// chrome.runtime.sendMessage delivers to all contexts at once.

export const Target = Object.freeze({
  BACKGROUND: 'background',
  OFFSCREEN: 'offscreen',
  POPUP: 'popup',
});

export const MessageType = Object.freeze({
  // popup -> background
  GET_STATE: 'get-state',
  START: 'start',
  STOP: 'stop',
  SET_HEAR: 'set-hear',
  SET_AUTO_STOP: 'set-auto-stop',
  CANCEL_AUTO_STOP: 'cancel-auto-stop',
  // background -> offscreen
  START_CAPTURE: 'start-capture',
  STOP_CAPTURE: 'stop-capture',
  SET_MONITOR: 'set-monitor',
  // offscreen -> background
  RECORDING_READY: 'recording-ready',
  RECORDING_FAILED: 'recording-failed',
  // background -> popup
  STATE_CHANGED: 'state-changed',
});

export const Status = Object.freeze({
  IDLE: 'idle',
  RECORDING: 'recording',
  SAVING: 'saving',
});

/**
 * The state published by the service worker and rendered by the popup.
 *
 * @typedef {object} RecorderState
 * @property {'idle' | 'recording' | 'saving'} status
 * @property {boolean} hear whether the user hears the tab while it is recorded
 * @property {number} autoStopSeconds the duration last chosen for the automatic stop
 * @property {number | null} [stopAt] when the recording stops by itself (ms
 *   since epoch), or null; only present while recording
 * @property {string} [error] the last failure, until the user's next action
 */

export function describeError(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sends a message and resolves with the receiver's response. The payload
 * travels under its own key, so that it cannot clash with the routing fields.
 */
export function send(target, type, payload = {}) {
  return chrome.runtime.sendMessage({ target, type, payload });
}

/** Sends a message without caring whether anyone is there to receive it. */
export function notify(target, type, payload) {
  send(target, type, payload).catch(() => {});
}

/**
 * Routes the messages addressed to `target` to `handlers`, keyed by message
 * type. A handler receives the message payload; its return value is the
 * response, and if it throws, the response is `{ error: <message> }`.
 */
export function listen(target, handlers) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = message?.target === target && handlers[message.type];
    if (!handler) return false;

    Promise.resolve()
      .then(() => handler(message.payload ?? {}))
      .catch((err) => {
        console.error(`Handling "${message.type}" failed:`, err);
        return { error: describeError(err) };
      })
      .then(sendResponse);
    return true; // respond asynchronously
  });
}

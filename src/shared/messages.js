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

export function describeError(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Sends a message and resolves with the receiver's response. */
export function send(target, type, payload = {}) {
  return chrome.runtime.sendMessage({ ...payload, target, type });
}

/** Sends a message without caring whether anyone is there to receive it. */
export function notify(target, type, payload) {
  send(target, type, payload).catch(() => {});
}

/**
 * Routes the messages addressed to `target` to `handlers`, keyed by message
 * type. A handler's return value is the response; if it throws, the response
 * is `{ error: <message> }`.
 */
export function listen(target, handlers) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = message?.target === target && handlers[message.type];
    if (!handler) return false;

    Promise.resolve()
      .then(() => handler(message))
      .catch((err) => {
        console.error(`Handling "${message.type}" failed:`, err);
        return { error: describeError(err) };
      })
      .then(sendResponse);
    return true; // respond asynchronously
  });
}

// Popup: shows the recording state and forwards the user's actions to the
// service worker, which owns all the logic.

import {
  MessageType,
  Status,
  Target,
  describeError,
  listen,
  send,
} from '../shared/messages.js';

const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const recordButton = document.getElementById('rec');
const hearButton = document.getElementById('hear');
const recordLabel = recordButton.querySelector('.label');
const hearLabel = hearButton.querySelector('.label');

const STATUS_TEXT = {
  [Status.IDLE]: () => 'Not recording',
  [Status.RECORDING]: ({ hear }) => `Recording (${hear ? 'you can hear it' : 'muted'})`,
  [Status.SAVING]: () => 'Saving file…',
};

let state = { status: Status.IDLE, hear: false };

function render(next) {
  state = next;
  // The stylesheet picks colors and button icons from these two attributes.
  document.body.dataset.status = state.status;
  document.body.dataset.hear = String(state.hear);

  statusEl.textContent = STATUS_TEXT[state.status](state);
  recordLabel.textContent =
    state.status === Status.RECORDING ? 'Stop and save file' : 'Start recording this tab';
  recordButton.disabled = state.status === Status.SAVING;
  hearLabel.textContent = state.hear ? 'Mute (keep recording)' : 'Unmute (hear it)';
  errorEl.textContent = state.error ?? '';
}

/** Sends a request to the service worker and renders the state it returns. */
async function request(type, payload) {
  try {
    const response = await send(Target.BACKGROUND, type, payload);
    // Without a status, the response is only an error report.
    render(response?.status ? response : { ...state, error: response?.error });
  } catch (err) {
    render({ ...state, error: describeError(err) });
  }
}

async function startRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await request(MessageType.START, { tabId: tab?.id });
}

recordButton.addEventListener('click', () =>
  state.status === Status.RECORDING ? request(MessageType.STOP) : startRecording(),
);

hearButton.addEventListener('click', () =>
  request(MessageType.SET_HEAR, { hear: !state.hear }),
);

// Keeps the popup in sync with changes made elsewhere: the keyboard shortcut,
// the recorded tab being closed, the download finishing.
listen(Target.POPUP, {
  [MessageType.STATE_CHANGED]: ({ state: next }) => render(next),
});

request(MessageType.GET_STATE);

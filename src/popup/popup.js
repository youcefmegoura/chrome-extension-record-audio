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
const scheduleForm = document.getElementById('schedule-form');
const scheduleButton = document.getElementById('schedule-btn');
const stopTimeEl = document.getElementById('stop-time');
const hoursInput = document.getElementById('hours');
const minutesInput = document.getElementById('minutes');
const secondsInput = document.getElementById('seconds');
const durationInputs = [hoursInput, minutesInput, secondsInput];
const recordLabel = recordButton.querySelector('.label');
const hearLabel = hearButton.querySelector('.label');

const STATUS_TEXT = {
  [Status.IDLE]: () => 'Not recording',
  [Status.RECORDING]: ({ hear }) => `Recording (${hear ? 'you can hear it' : 'muted'})`,
  [Status.SAVING]: () => 'Saving file…',
};

let state = { status: Status.IDLE, hear: false };
// Whether the duration fields hold the user's editable duration, as opposed
// to nothing yet or the countdown.
let durationShown = false;
let countdownTimer = null;

const COUNTDOWN_REFRESH_MS = 250;

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function showDuration(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  hoursInput.value = Math.floor(seconds / 3600);
  minutesInput.value = Math.floor((seconds % 3600) / 60);
  secondsInput.value = seconds % 60;
}

/** Returns the duration typed by the user in seconds, or null if malformed. */
function readDuration() {
  const [hours, minutes, seconds] = durationInputs.map((input) => Number(input.value));
  const wellFormed = [hours, minutes, seconds].every(
    (value) => Number.isInteger(value) && value >= 0,
  );
  return wellFormed ? hours * 3600 + minutes * 60 + seconds : null;
}

function isStopScheduled() {
  return state.status === Status.RECORDING && Boolean(state.stopAt);
}

function showTimeLeft() {
  showDuration(Math.ceil((state.stopAt - Date.now()) / 1000));
}

// While a stop is scheduled, the duration fields are locked and count down;
// otherwise they are editable and hold the duration the user chose last.
function renderSchedule() {
  const scheduled = isStopScheduled();
  // The stylesheet restyles the card from this attribute.
  document.body.dataset.scheduled = String(scheduled);
  for (const input of durationInputs) input.disabled = scheduled;
  scheduleButton.textContent = scheduled ? 'Cancel' : 'Schedule';
  stopTimeEl.textContent = scheduled ? formatTime(state.stopAt) : '';

  clearInterval(countdownTimer);
  countdownTimer = null;
  if (scheduled) {
    durationShown = false;
    showTimeLeft();
    countdownTimer = setInterval(showTimeLeft, COUNTDOWN_REFRESH_MS);
  } else if (!durationShown && Number.isInteger(state.autoStopSeconds)) {
    durationShown = true;
    showDuration(state.autoStopSeconds);
  }
}

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
  renderSchedule();
  errorEl.textContent = state.error ?? '';
}

/** Sends a request to the service worker and renders the state it returns. */
async function request(type, payload) {
  try {
    const response = await send(Target.BACKGROUND, type, payload);
    // The popup is read from disk every time it opens, but the service worker
    // is only replaced when the extension is reloaded. An older worker does
    // not know the newer requests and leaves them unanswered.
    if (!response) {
      throw new Error(
        'The extension was updated. Reload it on chrome://extensions, then try again.',
      );
    }
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

// The schedule button is a toggle. The duration counts from the click; the
// service worker checks that it is within the accepted range.
function toggleAutoStop() {
  return isStopScheduled()
    ? request(MessageType.CANCEL_AUTO_STOP)
    : request(MessageType.SET_AUTO_STOP, { seconds: readDuration() });
}

recordButton.addEventListener('click', () =>
  state.status === Status.RECORDING ? request(MessageType.STOP) : startRecording(),
);

scheduleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  toggleAutoStop();
});

hearButton.addEventListener('click', () =>
  request(MessageType.SET_HEAR, { hear: !state.hear }),
);

// Keeps the popup in sync with changes made elsewhere: the keyboard shortcut,
// the recorded tab being closed, the download finishing.
listen(Target.POPUP, {
  [MessageType.STATE_CHANGED]: ({ state: next }) => render(next),
});

request(MessageType.GET_STATE);

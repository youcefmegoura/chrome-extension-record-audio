// Recording workflow: idle -> recording -> saving -> idle.
//
// Every public operation runs one at a time, then publishes the resulting
// state to the toolbar badge and to the popup, and resolves with that state.
// A failure is stored and published as the `error` of the state, so that it
// is still visible if the popup was closed when it happened; the user's next
// action clears it.

import {
  MessageType,
  Status,
  Target,
  describeError,
  notify,
  send,
} from '../shared/messages.js';
import * as autoStop from './auto-stop.js';
import { renderBadge } from './badge.js';
import * as offscreenDocument from './offscreen-document.js';
import * as saveWatchdog from './save-watchdog.js';
import {
  autoStopPreference,
  hearPreference,
  lastError,
  saveSession,
} from './storage.js';

const SETTLED_DOWNLOAD_STATES = ['complete', 'interrupted'];
const SAVE_FAILED_MESSAGE = 'The recording could not be saved.';

let queue = Promise.resolve();

/** Runs `task` after every previously submitted task has finished. */
function exclusive(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

/** @returns {Promise<import('../shared/messages.js').RecorderState>} */
async function readState() {
  const [sessionActive, { saving }, hear, autoStopSeconds, stopAt, error] =
    await Promise.all([
      offscreenDocument.exists(),
      saveSession.get(),
      hearPreference.get(),
      autoStopPreference.get(),
      autoStop.scheduledTime(),
      lastError.get(),
    ]);
  const common = { hear, autoStopSeconds, ...(error && { error }) };
  if (!sessionActive) return { status: Status.IDLE, ...common };
  if (saving) return { status: Status.SAVING, ...common };
  // `stopAt` is when the recording will stop by itself, or null.
  return { status: Status.RECORDING, ...common, stopAt };
}

async function publish() {
  const state = await readState();
  await renderBadge(state);
  notify(Target.POPUP, MessageType.STATE_CHANGED, { state });
  return state;
}

/**
 * Runs `operation` exclusively and publishes the state it leaves behind.
 * `userAction` marks an operation the user asked for: it starts by clearing
 * the previous error, which the user has had the opportunity to read.
 */
function execute(operation, { userAction = false } = {}) {
  return exclusive(async () => {
    try {
      if (userAction) await lastError.clear();
      await operation();
    } catch (err) {
      console.error(err);
      await lastError.set(describeError(err));
    }
    return publish();
  });
}

const executeUserAction = (operation) => execute(operation, { userAction: true });

/** Asks the offscreen document to do something and fails if it could not. */
async function command(type, payload) {
  const response = await send(Target.OFFSCREEN, type, payload);
  if (response?.error) throw new Error(response.error);
}

async function beginSave() {
  await saveSession.begin();
  await saveWatchdog.arm();
}

async function endSession() {
  await autoStop.cancel();
  await saveWatchdog.disarm();
  await saveSession.clear();
  await offscreenDocument.close();
}

async function startRecording(tabId) {
  if (await offscreenDocument.exists()) return; // already recording or saving
  // Alarms can outlive the browser session that created them.
  await autoStop.cancel();
  await saveWatchdog.disarm();
  await saveSession.clear();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await offscreenDocument.create();
  try {
    await command(MessageType.START_CAPTURE, {
      streamId,
      hear: await hearPreference.get(),
    });
  } catch (err) {
    await endSession();
    throw err;
  }
}

// Reached from the popup and from the automatic stop alarm. If the offscreen
// document never hands the recording over, the save watchdog ends the session.
async function stopRecording() {
  const { status } = await readState();
  if (status !== Status.RECORDING) return;
  await autoStop.cancel();
  await beginSave();
  await command(MessageType.STOP_CAPTURE);
}

// Changes only what the user hears. The recorder keeps the full signal.
async function applyHear(hear) {
  await hearPreference.set(hear);
  if (await offscreenDocument.exists()) {
    await command(MessageType.SET_MONITOR, { hear });
  }
}

async function applyAutoStop(seconds) {
  const { status } = await readState();
  if (status !== Status.RECORDING) return;
  await autoStop.schedule(seconds);
  await autoStopPreference.set(seconds);
}

/** Names the file after the local time at which the recording was saved. */
export function buildFilename(date) {
  const pad = (value) => String(value).padStart(2, '0');
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(pad).join('-');
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad).join('-');
  return `tab-audio-${day}T${time}.m4a`;
}

/** Ends the session once the download can no longer need the recorded data. */
async function finishSave(downloadState) {
  if (!SETTLED_DOWNLOAD_STATES.includes(downloadState)) return;
  await endSession();
  if (downloadState === 'interrupted') {
    throw new Error('The download was interrupted; the recording was not saved.');
  }
}

async function saveRecording(url) {
  // The offscreen document repeats its message until it is acknowledged, so
  // the same recording can be announced twice.
  if ((await saveSession.get()).downloadId !== null) return;
  // Also reached without a stop request, when the recorded tab is closed.
  await beginSave();
  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename: buildFilename(new Date()),
    });
    await saveSession.setDownloadId(downloadId);
    // The download may have settled before its id was stored, in which case
    // handleDownloadChanged() could not match it.
    const [item] = await chrome.downloads.search({ id: downloadId });
    await finishSave(item?.state);
  } catch (err) {
    await endSession();
    throw err;
  }
}

// Reached when a save has been pending for a while. Operations run one at a
// time, so by now any download that was going to start has started.
async function recoverSave() {
  const { status } = await readState();
  if (status !== Status.SAVING) return;
  const { downloadId } = await saveSession.get();
  const [download] =
    downloadId === null ? [] : await chrome.downloads.search({ id: downloadId });
  if (!download) {
    // The recording was never handed over, or its download has vanished.
    await endSession();
    throw new Error(SAVE_FAILED_MESSAGE);
  }
  if (SETTLED_DOWNLOAD_STATES.includes(download.state)) {
    await finishSave(download.state);
  } else {
    await saveWatchdog.arm(); // still downloading: check again later
  }
}

export const getState = () => execute(() => {});
export const start = (tabId) => executeUserAction(() => startRecording(tabId));
export const stop = () => executeUserAction(stopRecording);
export const setHear = (hear) => executeUserAction(() => applyHear(hear));
export const setAutoStop = (seconds) => executeUserAction(() => applyAutoStop(seconds));
export const cancelAutoStop = () => executeUserAction(() => autoStop.cancel());
export const toggleHear = () =>
  executeUserAction(async () => applyHear(!(await hearPreference.get())));

export const handleAutoStopAlarm = () => execute(stopRecording);
export const handleSaveWatchdogAlarm = () => execute(recoverSave);
export const handleRecordingReady = (url) => execute(() => saveRecording(url));

export const handleRecordingFailed = (message) =>
  execute(async () => {
    await endSession();
    throw new Error(message);
  });

// The offscreen document owns the recorded data, so it is kept alive until
// the download has settled.
export async function handleDownloadChanged({ id, state }) {
  if (!SETTLED_DOWNLOAD_STATES.includes(state?.current)) return;
  const { downloadId } = await saveSession.get();
  if (id !== downloadId) return;
  await execute(() => finishSave(state.current));
}

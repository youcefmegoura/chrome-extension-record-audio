// Recording workflow: idle -> recording -> saving -> idle.
//
// Every public operation runs one at a time, then publishes the resulting
// state to the toolbar badge and to the popup, and resolves with that state
// (plus an `error` message if the operation failed).

import {
  MessageType,
  Status,
  Target,
  describeError,
  notify,
  send,
} from '../shared/messages.js';
import { renderBadge } from './badge.js';
import * as offscreenDocument from './offscreen-document.js';
import { hearPreference, saveSession } from './storage.js';

const SETTLED_DOWNLOAD_STATES = ['complete', 'interrupted'];

let queue = Promise.resolve();

/** Runs `task` after every previously submitted task has finished. */
function exclusive(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

async function readState() {
  const [sessionActive, { saving }, hear] = await Promise.all([
    offscreenDocument.exists(),
    saveSession.get(),
    hearPreference.get(),
  ]);
  if (!sessionActive) return { status: Status.IDLE, hear };
  return { status: saving ? Status.SAVING : Status.RECORDING, hear };
}

async function publish(error) {
  const state = { ...(await readState()), ...(error && { error }) };
  await renderBadge(state);
  notify(Target.POPUP, MessageType.STATE_CHANGED, { state });
  return state;
}

function execute(operation) {
  return exclusive(async () => {
    let error;
    try {
      await operation();
    } catch (err) {
      console.error(err);
      error = describeError(err);
    }
    return publish(error);
  });
}

/** Asks the offscreen document to do something and fails if it could not. */
async function command(type, payload) {
  const response = await send(Target.OFFSCREEN, type, payload);
  if (response?.error) throw new Error(response.error);
}

async function endSession() {
  await saveSession.clear();
  await offscreenDocument.close();
}

async function startRecording(tabId) {
  if (await offscreenDocument.exists()) return; // already recording or saving
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

async function stopRecording() {
  const { status } = await readState();
  if (status !== Status.RECORDING) return;
  await saveSession.begin();
  await command(MessageType.STOP_CAPTURE);
}

// Changes only what the user hears. The recorder keeps the full signal.
async function applyHear(hear) {
  await hearPreference.set(hear);
  if (await offscreenDocument.exists()) {
    await command(MessageType.SET_MONITOR, { hear });
  }
}

function buildFilename(date) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `tab-audio-${stamp}.webm`;
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
  // Also reached without a stop request, when the recorded tab is closed.
  await saveSession.begin();
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

export const getState = () => execute(() => {});
export const start = (tabId) => execute(() => startRecording(tabId));
export const stop = () => execute(stopRecording);
export const setHear = (hear) => execute(() => applyHear(hear));
export const toggleHear = () =>
  execute(async () => applyHear(!(await hearPreference.get())));
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

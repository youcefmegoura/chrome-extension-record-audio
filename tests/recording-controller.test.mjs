import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

import * as controller from '../src/background/recording-controller.js';
import { createFakeChrome } from './fake-chrome.mjs';

const TAB_ID = 7;
const RECORDING_URL = 'blob:recording';
const AUTO_STOP_ALARM = 'auto-stop';
const SAVE_WATCHDOG_ALARM = 'save-watchdog';

let chrome;

beforeEach(() => {
  chrome = createFakeChrome();
  globalThis.chrome = chrome;
  // The controller logs every failure it reports; keep the test output clean.
  mock.method(console, 'error', () => {});
});

function messagesOfType(type) {
  return chrome.sentMessages.filter((message) => message.type === type);
}

test('is idle and muted by default', async () => {
  const state = await controller.getState();

  assert.equal(state.status, 'idle');
  assert.equal(state.hear, false);
  assert.equal(state.autoStopSeconds, 3600);
  assert.equal(state.error, undefined);
  assert.equal(chrome.badge.text, '');
});

test('start opens the offscreen document and starts the capture', async () => {
  const state = await controller.start(TAB_ID);

  assert.equal(state.status, 'recording');
  assert.equal(state.stopAt, null);
  assert.equal(chrome.badge.text, 'REC');
  assert.deepEqual(messagesOfType('start-capture'), [
    {
      target: 'offscreen',
      type: 'start-capture',
      payload: { streamId: 'stream-id', hear: false },
    },
  ]);
});

test('start does nothing while a recording is in progress', async () => {
  await controller.start(TAB_ID);
  await controller.start(TAB_ID);

  assert.equal(messagesOfType('start-capture').length, 1);
});

test('a capture that cannot start ends the session and reports why', async () => {
  chrome.offscreen.respond = () => ({ error: 'Cannot capture this page.' });

  const state = await controller.start(TAB_ID);

  assert.equal(state.status, 'idle');
  assert.equal(state.error, 'Cannot capture this page.');
  assert.equal(chrome.offscreen.open, false);
  assert.equal(chrome.badge.text, '!');
});

test('every state change is published to the popup', async () => {
  const state = await controller.start(TAB_ID);

  assert.deepEqual(messagesOfType('state-changed').at(-1), {
    target: 'popup',
    type: 'state-changed',
    payload: { state },
  });
});

test('operations run one at a time, in the order they were requested', async () => {
  const [started, stopped] = await Promise.all([
    controller.start(TAB_ID),
    controller.stop(),
  ]);

  assert.equal(started.status, 'recording');
  assert.equal(stopped.status, 'saving');
});

test('stop asks the recorder to finish and waits for the recording', async () => {
  await controller.start(TAB_ID);

  const state = await controller.stop();

  assert.equal(state.status, 'saving');
  assert.equal(messagesOfType('stop-capture').length, 1);
  assert.ok(chrome.alarms.all.has(SAVE_WATCHDOG_ALARM));
});

test('a finished recording is downloaded, then the session ends', async () => {
  await controller.start(TAB_ID);
  await controller.stop();

  const saving = await controller.handleRecordingReady(RECORDING_URL);
  assert.equal(saving.status, 'saving');
  assert.equal(chrome.downloads.requests[0].url, RECORDING_URL);
  assert.match(chrome.downloads.requests[0].filename, /^tab-audio-.+\.m4a$/);
  // The offscreen document owns the data until the download has settled.
  assert.equal(chrome.offscreen.open, true);

  await controller.handleDownloadChanged(chrome.downloads.settle(1, 'complete'));

  const state = await controller.getState();
  assert.equal(state.status, 'idle');
  assert.equal(state.error, undefined);
  assert.equal(chrome.offscreen.open, false);
  assert.equal(chrome.alarms.all.size, 0);
});

test('a download that settles before its id is stored still ends the session', async () => {
  chrome.downloads.initialState = 'complete';
  await controller.start(TAB_ID);

  const state = await controller.handleRecordingReady(RECORDING_URL);

  assert.equal(state.status, 'idle');
});

test('a recording announced twice is downloaded once', async () => {
  await controller.start(TAB_ID);
  await controller.handleRecordingReady(RECORDING_URL);
  await controller.handleRecordingReady(RECORDING_URL);

  assert.equal(chrome.downloads.requests.length, 1);
});

test('a recording that ends by itself is saved without a stop request', async () => {
  await controller.start(TAB_ID);

  const state = await controller.handleRecordingReady(RECORDING_URL);

  assert.equal(state.status, 'saving');
  assert.equal(chrome.downloads.requests.length, 1);
});

test('downloads of other origins are ignored', async () => {
  await controller.start(TAB_ID);
  await controller.handleRecordingReady(RECORDING_URL);

  await controller.handleDownloadChanged({ id: 99, state: { current: 'complete' } });

  assert.equal((await controller.getState()).status, 'saving');
});

test('an interrupted download is reported, even to a popup opened later', async () => {
  await controller.start(TAB_ID);
  await controller.handleRecordingReady(RECORDING_URL);

  await controller.handleDownloadChanged(chrome.downloads.settle(1, 'interrupted'));

  const state = await controller.getState();
  assert.equal(state.status, 'idle');
  assert.match(state.error, /interrupted/);
  assert.equal(chrome.badge.text, '!');
});

test("the user's next action clears the previous error", async () => {
  await controller.handleRecordingFailed('No audio was captured.');
  assert.equal((await controller.getState()).error, 'No audio was captured.');

  const state = await controller.setHear(true);

  assert.equal(state.error, undefined);
  assert.equal(chrome.badge.text, '');
});

test('a failed recording ends the session', async () => {
  await controller.start(TAB_ID);
  await controller.stop();

  const state = await controller.handleRecordingFailed('No audio was captured.');

  assert.equal(state.status, 'idle');
  assert.equal(state.error, 'No audio was captured.');
  assert.equal(chrome.offscreen.open, false);
});

test('the watchdog ends a save whose recording never arrives', async () => {
  await controller.start(TAB_ID);
  await controller.stop();

  const state = await controller.handleSaveWatchdogAlarm();

  assert.equal(state.status, 'idle');
  assert.equal(state.error, 'The recording could not be saved.');
  assert.equal(chrome.offscreen.open, false);
});

test('the watchdog keeps waiting for a download in progress', async () => {
  await controller.start(TAB_ID);
  await controller.handleRecordingReady(RECORDING_URL);
  chrome.alarms.all.delete(SAVE_WATCHDOG_ALARM); // the alarm has just fired

  const state = await controller.handleSaveWatchdogAlarm();

  assert.equal(state.status, 'saving');
  assert.equal(state.error, undefined);
  assert.ok(chrome.alarms.all.has(SAVE_WATCHDOG_ALARM));
});

test('the watchdog finishes a save whose download event was missed', async () => {
  await controller.start(TAB_ID);
  await controller.handleRecordingReady(RECORDING_URL);
  chrome.downloads.settle(1, 'complete');

  const state = await controller.handleSaveWatchdogAlarm();

  assert.equal(state.status, 'idle');
  assert.equal(state.error, undefined);
});

test('the watchdog leaves a recording in progress alone', async () => {
  await controller.start(TAB_ID);

  const state = await controller.handleSaveWatchdogAlarm();

  assert.equal(state.status, 'recording');
});

test('the hear preference is remembered and forwarded to the recorder', async () => {
  await controller.start(TAB_ID);

  const state = await controller.setHear(true);

  assert.equal(state.hear, true);
  assert.equal(chrome.badge.color, '#188038');
  assert.deepEqual(messagesOfType('set-monitor').at(-1).payload, { hear: true });
  assert.equal((await controller.toggleHear()).hear, false);
});

test('an automatic stop can be scheduled and cancelled while recording', async () => {
  await controller.start(TAB_ID);

  const scheduled = await controller.setAutoStop(120);
  assert.equal(scheduled.autoStopSeconds, 120);
  assert.ok(Math.abs(scheduled.stopAt - (Date.now() + 120_000)) < 1000);

  const cancelled = await controller.cancelAutoStop();
  assert.equal(cancelled.stopAt, null);
  assert.equal(cancelled.autoStopSeconds, 120);
});

test('an automatic stop out of range is rejected', async () => {
  await controller.start(TAB_ID);

  for (const seconds of [29, 24 * 60 * 60, 90.5, null]) {
    const state = await controller.setAutoStop(seconds);
    assert.match(state.error, /between 30 seconds/);
    assert.equal(state.stopAt, null);
  }
});

test('an automatic stop is not scheduled when nothing is recording', async () => {
  await controller.setAutoStop(120);

  assert.equal(chrome.alarms.all.has(AUTO_STOP_ALARM), false);
});

test('the automatic stop alarm stops the recording', async () => {
  await controller.start(TAB_ID);
  await controller.setAutoStop(120);

  const state = await controller.handleAutoStopAlarm();

  assert.equal(state.status, 'saving');
  assert.equal(chrome.alarms.all.has(AUTO_STOP_ALARM), false);
});

test('the file is named after the local time', () => {
  const name = controller.buildFilename(new Date(2026, 0, 2, 3, 4, 5));

  assert.equal(name, 'tab-audio-2026-01-02T03-04-05.m4a');
});

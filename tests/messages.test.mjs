import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { describeError, listen, notify, send } from '../src/shared/messages.js';
import { createFakeChrome, dispatchMessage } from './fake-chrome.mjs';

let chrome;

beforeEach(() => {
  chrome = createFakeChrome();
  globalThis.chrome = chrome;
});

test('send keeps the payload apart from the routing fields', async () => {
  await send('background', 'start', { target: 'elsewhere', tabId: 7 });

  assert.deepEqual(chrome.sentMessages, [
    { target: 'background', type: 'start', payload: { target: 'elsewhere', tabId: 7 } },
  ]);
});

test('notify ignores the absence of a receiver', async () => {
  chrome.runtime.sendMessage = async () => {
    throw new Error('Receiving end does not exist.');
  };

  notify('popup', 'state-changed', {});
  await new Promise((resolve) => setImmediate(resolve)); // no unhandled rejection
});

test('listen answers with what the handler returns', async () => {
  listen('background', { start: ({ tabId }) => ({ started: tabId }) });

  const response = await dispatchMessage(chrome, {
    target: 'background',
    type: 'start',
    payload: { tabId: 7 },
  });

  assert.deepEqual(response, { started: 7 });
});

test('listen turns a failing handler into an error response', async (t) => {
  t.mock.method(console, 'error', () => {});
  listen('background', {
    start: async () => {
      throw new Error('Nope.');
    },
  });

  const response = await dispatchMessage(chrome, { target: 'background', type: 'start' });

  assert.deepEqual(response, { error: 'Nope.' });
});

test('listen leaves the messages of other targets and types unanswered', async () => {
  listen('background', { start: () => 'ok' });

  await assert.rejects(dispatchMessage(chrome, { target: 'popup', type: 'start' }));
  await assert.rejects(dispatchMessage(chrome, { target: 'background', type: 'stop' }));
});

test('describeError accepts anything that was thrown', () => {
  assert.equal(describeError(new Error('Broken.')), 'Broken.');
  assert.equal(describeError('plain'), 'plain');
});

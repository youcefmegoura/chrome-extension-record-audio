// Service worker: starts and stops recording, and switches listening on/off.
// The recording itself runs in an offscreen document, because service
// workers have no access to MediaRecorder.

let pendingDownloadId = null;
let stopping = false;

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  return contexts.length > 0;
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument();
}

async function getHear() {
  const { hear = false } = await chrome.storage.local.get('hear');
  return hear;
}

async function getState() {
  return {
    recording: (await hasOffscreenDocument()) && !stopping,
    hear: await getHear(),
  };
}

async function updateBadge() {
  const { recording, hear } = await getState();
  chrome.action.setBadgeText({ text: recording ? 'REC' : '' });
  // Red while recording silently, green while recording and listening.
  chrome.action.setBadgeBackgroundColor({ color: hear ? '#1a7f37' : '#d00000' });
}

async function start(tabId) {
  if (await hasOffscreenDocument()) return;
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Record audio from the current tab',
    });
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'start',
      streamId,
      hear: await getHear(),
    });
  } catch (err) {
    await closeOffscreenDocument();
    await updateBadge();
    return String(err.message || err);
  }
  await updateBadge();
}

async function stop() {
  if (!(await hasOffscreenDocument()) || stopping) return;
  stopping = true;
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
  await updateBadge();
}

// Changes only what you hear. The recorder keeps receiving the full signal.
async function setHear(hear) {
  await chrome.storage.local.set({ hear });
  if (await hasOffscreenDocument()) {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'monitor', hear });
  }
  await updateBadge();
}

async function save(url) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  pendingDownloadId = await chrome.downloads.download({
    url,
    filename: `tab-audio-${stamp}.webm`,
  });
  // Covers the case where the tab was closed and recording ended by itself.
  stopping = true;
  await updateBadge();
}

async function handle(msg) {
  let error;
  if (msg.type === 'start') error = await start(msg.tabId);
  if (msg.type === 'stop') await stop();
  if (msg.type === 'setHear') await setHear(msg.hear);
  if (msg.type === 'save') await save(msg.url);
  if (msg.type === 'error') {
    console.error('Recording failed:', msg.message);
    stopping = false;
    await closeOffscreenDocument();
    await updateBadge();
  }
  return { ...(await getState()), error };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'background') return;
  handle(msg).then(sendResponse);
  return true; // respond asynchronously
});

// Keyboard shortcut: mute or unmute what you hear.
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-hear') await setHear(!(await getHear()));
});

// Keep the offscreen document (which owns the recorded data) alive until
// the download has finished, then close it.
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.id !== pendingDownloadId || !delta.state) return;
  if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
    pendingDownloadId = null;
    stopping = false;
    await closeOffscreenDocument();
    await updateBadge();
  }
});

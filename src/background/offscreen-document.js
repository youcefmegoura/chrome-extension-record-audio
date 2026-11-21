// Lifecycle of the offscreen document that hosts the recorder. Its existence
// is the source of truth for "a recording session is in progress": unlike
// service worker variables, it survives the worker being suspended.

const DOCUMENT_URL = 'src/offscreen/offscreen.html';

export async function exists() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  return contexts.length > 0;
}

export function create() {
  return chrome.offscreen.createDocument({
    url: DOCUMENT_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Record audio from the current tab',
  });
}

export async function close() {
  if (await exists()) await chrome.offscreen.closeDocument();
}

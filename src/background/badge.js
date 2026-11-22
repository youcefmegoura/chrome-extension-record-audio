import { Status } from '../shared/messages.js';

const RECORDING_TEXT = 'REC';
const ERROR_TEXT = '!';
const LISTENING_COLOR = '#188038'; // green: recording and audible
const MUTED_COLOR = '#d93025'; // red: recording silently
const ERROR_COLOR = '#d93025';

function badgeFor({ status, hear, error }) {
  if (status === Status.RECORDING) {
    return { text: RECORDING_TEXT, color: hear ? LISTENING_COLOR : MUTED_COLOR };
  }
  // Tells the user that something failed while the popup was closed.
  if (error) return { text: ERROR_TEXT, color: ERROR_COLOR };
  return { text: '', color: MUTED_COLOR };
}

export async function renderBadge(state) {
  const { text, color } = badgeFor(state);
  await Promise.all([
    chrome.action.setBadgeText({ text }),
    chrome.action.setBadgeBackgroundColor({ color }),
  ]);
}

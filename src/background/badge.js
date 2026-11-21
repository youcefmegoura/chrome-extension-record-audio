import { Status } from '../shared/messages.js';

const BADGE_TEXT = 'REC';
const LISTENING_COLOR = '#188038'; // green: recording and audible
const MUTED_COLOR = '#d93025'; // red: recording silently

export async function renderBadge({ status, hear }) {
  await Promise.all([
    chrome.action.setBadgeText({
      text: status === Status.RECORDING ? BADGE_TEXT : '',
    }),
    chrome.action.setBadgeBackgroundColor({
      color: hear ? LISTENING_COLOR : MUTED_COLOR,
    }),
  ]);
}

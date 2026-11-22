// Timer that ends the recording automatically. It is a chrome.alarms alarm
// rather than a setTimeout, so that it survives the service worker being
// suspended. The alarm itself is the source of truth for "a stop is
// scheduled".

const ALARM_NAME = 'auto-stop';
// Chrome does not fire alarms sooner than 30 seconds after they are set.
const MIN_SECONDS = 30;
const MAX_SECONDS = 24 * 60 * 60 - 1;

/** Schedules the stop `seconds` from now, replacing any previous schedule. */
export async function schedule(seconds) {
  if (!Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
    throw new Error('Set a duration between 30 seconds and 23 h 59 min 59 s.');
  }
  return chrome.alarms.create(ALARM_NAME, { when: Date.now() + seconds * 1000 });
}

export function cancel() {
  return chrome.alarms.clear(ALARM_NAME);
}

/** Resolves with the time of the scheduled stop (ms since epoch), or null. */
export async function scheduledTime() {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  return alarm?.scheduledTime ?? null;
}

export function isAutoStopAlarm(alarm) {
  return alarm.name === ALARM_NAME;
}

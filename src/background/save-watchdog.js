// Timer that detects a save which never completes, for instance because the
// offscreen document could not hand the recording over. Without it, the
// extension would stay in the "saving" state until the browser restarts.
// Like the automatic stop, it is an alarm so that it survives the service
// worker being suspended.

const ALARM_NAME = 'save-watchdog';
// The shortest delay Chrome accepts for an alarm; a healthy save hands the
// recording over within a few seconds.
const DELAY_MINUTES = 0.5;

/** Starts the timer, replacing any previous one. */
export function arm() {
  return chrome.alarms.create(ALARM_NAME, { delayInMinutes: DELAY_MINUTES });
}

export function disarm() {
  return chrome.alarms.clear(ALARM_NAME);
}

export function isSaveWatchdogAlarm(alarm) {
  return alarm.name === ALARM_NAME;
}

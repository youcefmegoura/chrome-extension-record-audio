// Service worker entry point: maps browser events to the recording workflow.
// The recording itself runs in an offscreen document, because service
// workers have no access to MediaRecorder.

import { MessageType, Target, listen } from '../shared/messages.js';
import { isAutoStopAlarm } from './auto-stop.js';
import * as controller from './recording-controller.js';
import { isSaveWatchdogAlarm } from './save-watchdog.js';

const TOGGLE_HEAR_COMMAND = 'toggle-hear';

listen(Target.BACKGROUND, {
  [MessageType.GET_STATE]: () => controller.getState(),
  [MessageType.START]: ({ tabId }) => controller.start(tabId),
  [MessageType.STOP]: () => controller.stop(),
  [MessageType.SET_HEAR]: ({ hear }) => controller.setHear(hear),
  [MessageType.SET_AUTO_STOP]: ({ seconds }) => controller.setAutoStop(seconds),
  [MessageType.CANCEL_AUTO_STOP]: () => controller.cancelAutoStop(),
  [MessageType.RECORDING_READY]: ({ url }) => controller.handleRecordingReady(url),
  [MessageType.RECORDING_FAILED]: ({ message }) =>
    controller.handleRecordingFailed(message),
});

chrome.commands.onCommand.addListener((command) => {
  if (command === TOGGLE_HEAR_COMMAND) controller.toggleHear();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (isAutoStopAlarm(alarm)) controller.handleAutoStopAlarm();
  if (isSaveWatchdogAlarm(alarm)) controller.handleSaveWatchdogAlarm();
});

chrome.downloads.onChanged.addListener(controller.handleDownloadChanged);

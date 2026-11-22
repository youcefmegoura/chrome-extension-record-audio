// Offscreen document entry point: exposes the recorder to the service worker.

import {
  MessageType,
  Target,
  describeError,
  listen,
  send,
} from '../shared/messages.js';
import { TabAudioRecorder } from './tab-audio-recorder.js';

const DELIVERY_ATTEMPTS = 3;
const DELIVERY_RETRY_MS = 1000;

/**
 * Reports the end of a recording to the service worker, again if needed
 * until it answers: a report that gets lost loses the recording with it.
 */
async function report(type, payload) {
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt += 1) {
    try {
      if (await send(Target.BACKGROUND, type, payload)) return;
    } catch (err) {
      console.error(`Reporting "${type}" failed (attempt ${attempt}):`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, DELIVERY_RETRY_MS));
  }
}

const recorder = new TabAudioRecorder({
  // The service worker downloads the recording from this URL, then closes
  // this document, which releases the data.
  onComplete: (recording) =>
    report(MessageType.RECORDING_READY, { url: URL.createObjectURL(recording) }),
  onError: (err) =>
    report(MessageType.RECORDING_FAILED, { message: describeError(err) }),
});

listen(Target.OFFSCREEN, {
  [MessageType.START_CAPTURE]: ({ streamId, hear }) => recorder.start(streamId, hear),
  [MessageType.STOP_CAPTURE]: () => recorder.stop(),
  [MessageType.SET_MONITOR]: ({ hear }) => recorder.setMonitor(hear),
});

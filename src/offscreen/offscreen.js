// Offscreen document entry point: exposes the recorder to the service worker.

import {
  MessageType,
  Target,
  describeError,
  listen,
  notify,
} from '../shared/messages.js';
import { TabAudioRecorder } from './tab-audio-recorder.js';

const recorder = new TabAudioRecorder({
  // The service worker downloads the recording from this URL, then closes
  // this document, which releases the data.
  onComplete: (recording) =>
    notify(Target.BACKGROUND, MessageType.RECORDING_READY, {
      url: URL.createObjectURL(recording),
    }),
  onError: (err) =>
    notify(Target.BACKGROUND, MessageType.RECORDING_FAILED, {
      message: describeError(err),
    }),
});

listen(Target.OFFSCREEN, {
  [MessageType.START_CAPTURE]: ({ streamId, hear }) => recorder.start(streamId, hear),
  [MessageType.STOP_CAPTURE]: () => recorder.stop(),
  [MessageType.SET_MONITOR]: ({ hear }) => recorder.setMonitor(hear),
});

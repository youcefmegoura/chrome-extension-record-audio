// Captures a tab's audio stream and records it.
//
// Chrome mutes a tab locally while it is captured. To let the user listen,
// the captured stream is played back through a gain node: gain 1 = audible,
// gain 0 = silent. The recorder reads the stream directly, so the recording
// is identical whichever way the gain is set.

const MIME_TYPE = 'audio/webm;codecs=opus';
const CONTAINER_TYPE = 'audio/webm';
const AUDIO_BITS_PER_SECOND = 192_000;
const CHUNK_INTERVAL_MS = 1000;

export class TabAudioRecorder {
  #onComplete;
  #onError;
  #stream = null;
  #audioContext = null;
  #monitorGain = null;
  #recorder = null;
  #chunks = [];

  /**
   * @param {object} callbacks
   * @param {(recording: Blob) => void} callbacks.onComplete called when the
   *   recording ends, whether stop() was called or the tab was closed.
   * @param {(error: Error) => void} callbacks.onError called when the
   *   recording ends without any audio.
   */
  constructor({ onComplete, onError }) {
    this.#onComplete = onComplete;
    this.#onError = onError;
  }

  async start(streamId, hear) {
    if (this.#recorder) throw new Error('A recording is already in progress.');
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
        },
        video: false,
      });
      await this.#startMonitor(hear);
      this.#startRecorder();
    } catch (err) {
      this.#release();
      throw err;
    }
  }

  setMonitor(hear) {
    if (this.#monitorGain) this.#monitorGain.gain.value = hear ? 1 : 0;
  }

  stop() {
    if (this.#recorder && this.#recorder.state !== 'inactive') this.#recorder.stop();
  }

  async #startMonitor(hear) {
    this.#audioContext = new AudioContext();
    this.#monitorGain = this.#audioContext.createGain();
    this.setMonitor(hear);
    this.#audioContext.createMediaStreamSource(this.#stream).connect(this.#monitorGain);
    this.#monitorGain.connect(this.#audioContext.destination);
    await this.#audioContext.resume();
  }

  #startRecorder() {
    this.#chunks = [];
    this.#recorder = new MediaRecorder(this.#stream, {
      mimeType: MIME_TYPE,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    this.#recorder.ondataavailable = ({ data }) => {
      if (data.size > 0) this.#chunks.push(data);
    };
    this.#recorder.onerror = ({ error }) => console.error('Recorder error:', error);
    // Fires on stop(), on a recorder error, and when the tab is closed.
    this.#recorder.onstop = () => this.#finish();
    this.#recorder.start(CHUNK_INTERVAL_MS);
  }

  #finish() {
    const recording = new Blob(this.#chunks, { type: CONTAINER_TYPE });
    this.#release();
    if (recording.size > 0) this.#onComplete(recording);
    else this.#onError(new Error('No audio was captured.'));
  }

  #release() {
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#audioContext?.close();
    this.#stream = null;
    this.#audioContext = null;
    this.#monitorGain = null;
    this.#recorder = null;
    this.#chunks = [];
  }
}

// Offscreen document: captures the tab's audio stream and records it.
//
// Chrome mutes a tab locally while it is captured. To let you listen, the
// captured stream is played back through a gain node: gain 1 = you hear it,
// gain 0 = silent. The recorder reads the stream directly, so the recording
// is identical whichever way the gain is set.

let recorder = null;
let chunks = [];
let audioContext = null;
let monitorGain = null;

async function start(streamId, hear) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    audioContext = new AudioContext();
    monitorGain = audioContext.createGain();
    monitorGain.gain.value = hear ? 1 : 0;
    audioContext.createMediaStreamSource(stream).connect(monitorGain);
    monitorGain.connect(audioContext.destination);
    audioContext.resume();

    chunks = [];
    recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 192000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    // Also fires if the tab is closed mid-recording.
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (audioContext) audioContext.close();
      const blob = new Blob(chunks, { type: 'audio/webm' });
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'save',
        url: URL.createObjectURL(blob),
      });
    };
    recorder.start(1000);
  } catch (err) {
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'error',
      message: String(err),
    });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;

  if (msg.type === 'start') start(msg.streamId, msg.hear);

  if (msg.type === 'monitor' && monitorGain) {
    monitorGain.gain.value = msg.hear ? 1 : 0;
  }

  if (msg.type === 'stop' && recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
});

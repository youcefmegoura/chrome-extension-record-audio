const statusEl = document.getElementById('status');
const recBtn = document.getElementById('rec');
const hearBtn = document.getElementById('hear');
const errorEl = document.getElementById('error');

let state = { recording: false, hear: false };

function send(msg) {
  return chrome.runtime.sendMessage({ target: 'background', ...msg });
}

function render(next) {
  if (next) state = next;
  statusEl.textContent = state.recording
    ? `Recording (${state.hear ? 'you can hear it' : 'muted'})`
    : 'Not recording';
  recBtn.textContent = state.recording ? 'Stop and save file' : 'Start recording this tab';
  hearBtn.textContent = state.hear ? 'Mute (keep recording)' : 'Unmute (hear it)';
  errorEl.textContent = state.error || '';
}

recBtn.addEventListener('click', async () => {
  if (state.recording) {
    render(await send({ type: 'stop' }));
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  render(await send({ type: 'start', tabId: tab.id }));
});

hearBtn.addEventListener('click', async () => {
  render(await send({ type: 'setHear', hear: !state.hear }));
});

send({ type: 'getState' }).then(render);

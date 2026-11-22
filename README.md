# Tab Audio Recorder

A Chrome extension that records the audio of the current tab to a `.m4a`
file. You can mute or unmute what you hear at any time: the recording always
gets the full audio.

## Features

- Records the current tab's audio (AAC in MP4, 64 kbit/s).
- Listening is independent from recording: mute the tab for yourself while it
  keeps being recorded.
- Keyboard shortcut to mute or unmute: `Alt+Shift+M` (editable in
  `chrome://extensions/shortcuts`).
- Toolbar badge while recording: green when you can hear the tab, red when it
  is muted.
- Saves the file automatically if the recorded tab is closed.
- No build step, no dependencies, no data leaves your computer.

## Install

The extension is not on the Chrome Web Store; load it from source. It needs
Chrome 126 or later.

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder.

## Usage

1. Open the tab you want to record and click the extension icon.
2. Click **Start recording this tab**.
3. Use **Unmute (hear it)** / **Mute (keep recording)**, or the keyboard
   shortcut, to choose whether you hear the tab. A new recording starts muted
   unless you unmuted last time.
4. Click **Stop and save file**. The recording is downloaded as
   `tab-audio-<date>T<time>.m4a` in your downloads folder.

Chrome cannot capture its own pages (`chrome://...`, the Web Store); starting a
recording there shows an error.

## How it works

A Manifest V3 service worker cannot use `MediaRecorder`, so the recording runs
in an [offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen):

1. The popup asks the service worker to start.
2. The service worker gets a stream id for the tab with
   [`chrome.tabCapture`](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
   and creates the offscreen document.
3. The offscreen document opens the stream and records it. Chrome mutes a
   captured tab locally, so the stream is also played back through a gain node:
   gain 1 when you want to hear it, gain 0 when muted. The recorder reads the
   stream directly, so the gain never affects the file.
4. When the recording ends, the service worker downloads it and closes the
   offscreen document once the download has finished.

The service worker keeps no state in memory, because Chrome suspends it when
idle. The existence of the offscreen document tells whether a recording is in
progress; the rest is in `chrome.storage`.

## Project structure

```
manifest.json
icons/
src/
  shared/messages.js                   message names, statuses, messaging helpers
  background/index.js                  service worker entry point
  background/recording-controller.js   workflow: idle -> recording -> saving -> idle
  background/offscreen-document.js     offscreen document lifecycle
  background/storage.js                persisted state
  background/badge.js                  toolbar badge
  offscreen/offscreen.js               offscreen document entry point
  offscreen/tab-audio-recorder.js      capture, monitoring and recording
  popup/                               popup markup, styles and script
scripts/validate.mjs                   checks run in CI
```

## Permissions

| Permission   | Why it is needed                                              |
| ------------ | ------------------------------------------------------------- |
| `tabCapture` | Capture the audio of the tab.                                 |
| `activeTab`  | Allow capturing the tab on which you opened the popup.        |
| `offscreen`  | Create the hidden document that runs the recorder.            |
| `downloads`  | Save the recording to your downloads folder.                  |
| `storage`    | Remember the mute preference and the state of a pending save. |

## Development

There is nothing to install or build. After editing the sources, click the
reload button of the extension in `chrome://extensions`.

Run the same checks as the CI (requires Node.js):

```sh
node scripts/validate.mjs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes.

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

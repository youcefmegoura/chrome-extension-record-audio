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
- Automatic stop: end and save the recording after a duration you choose
  (hours, minutes and seconds), with a live countdown.
- Saves the file automatically if the recorded tab is closed.
- If a recording cannot be saved, the toolbar badge shows `!` and the popup
  says why the next time you open it.
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
   `tab-audio-<date>T<time>.m4a` (local time) in your downloads folder.

While a recording is running, the popup shows a **Stop automatically** card.
Set a duration in hours, minutes and seconds (30 seconds to 23 h 59 min 59 s)
and click **Schedule**: the recording stops and is saved after that duration,
counted from the click. The fields then lock and count down, and the button
becomes **Cancel**, which removes the timer and keeps recording. The popup can
stay closed: the recording is stopped and saved in the background.

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
progress; the rest is in `chrome.storage`. For the same reason, the automatic
stop is a
[`chrome.alarms`](https://developer.chrome.com/docs/extensions/reference/api/alarms)
alarm rather than a timer in the worker.

A second alarm watches every save: if the recording is not handed over or its
download never settles, the session is ended and the failure is reported,
instead of leaving the extension stuck in the saving state.

## Project structure

```
manifest.json
icons/
src/
  shared/messages.js                   message names, statuses, messaging helpers
  background/index.js                  service worker entry point
  background/recording-controller.js   workflow: idle -> recording -> saving -> idle
  background/offscreen-document.js     offscreen document lifecycle
  background/auto-stop.js              automatic stop timer
  background/save-watchdog.js          timer that ends a save that never completes
  background/storage.js                persisted state
  background/badge.js                  toolbar badge
  offscreen/offscreen.js               offscreen document entry point
  offscreen/tab-audio-recorder.js      capture, monitoring and recording
  popup/                               popup markup, styles and script
scripts/validate.mjs                   checks run in CI
tests/                                 unit tests, run against a fake chrome API
```

## Permissions

| Permission   | Why it is needed                                              |
| ------------ | ------------------------------------------------------------- |
| `tabCapture` | Capture the audio of the tab.                                 |
| `activeTab`  | Allow capturing the tab on which you opened the popup.        |
| `offscreen`  | Create the hidden document that runs the recorder.            |
| `downloads`  | Save the recording to your downloads folder.                  |
| `storage`    | Remember your preferences and the state of a pending save.    |
| `alarms`     | Stop the recording at the scheduled time.                     |

## Development

There is nothing to install or build. After editing the sources, click the
reload button of the extension in `chrome://extensions`.

Run the same checks as the CI (requires Node.js 22.7 or later):

```sh
node scripts/validate.mjs
node --test
```

The tests use the test runner built into Node.js, so there is still nothing to
install. They cover the service worker logic and the messaging helpers; the
capture itself needs a real browser and is tested by hand.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes.

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

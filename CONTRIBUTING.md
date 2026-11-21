# Contributing

Thanks for your interest in improving Tab Audio Recorder. Bug reports, ideas
and pull requests are welcome.

## Reporting a bug or suggesting a feature

Open an issue and include:

- what you did, what you expected and what happened instead;
- your Chrome version (`chrome://version`) and operating system;
- any error shown in the popup, or in the service worker console
  (`chrome://extensions` > **Inspect views: service worker**).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Load the extension from your working copy: `chrome://extensions` >
   **Developer mode** > **Load unpacked**. Reload it there after each change.
3. Test by hand: start a recording, mute and unmute, stop, and check that the
   saved file plays. Also try closing the tab while recording.
4. Run the checks:

   ```sh
   node scripts/validate.mjs
   ```

5. Open a pull request that explains what changes and why.

## Guidelines

- Keep the project free of dependencies and of any build step.
- Write code, comments and documentation in English.
- One responsibility per module; see the project structure in the
  [README](README.md). Message names and statuses belong in
  `src/shared/messages.js`.
- Keep no state in service worker variables: Chrome suspends the worker when
  idle. Use `chrome.storage` instead.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages, for example `fix: keep the popup in sync after a failed download`.
- A new permission in `manifest.json` needs a justification in the pull
  request and in the README.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).

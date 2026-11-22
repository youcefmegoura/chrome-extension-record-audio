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
4. Run the checks, and add or update tests in `tests/` for the logic you
   change:

   ```sh
   node scripts/validate.mjs
   node --test
   ```

5. Open a pull request that explains what changes and why.

## Guidelines

- Keep the project free of dependencies and of any build step.
- Write code, comments and documentation in English.
- One responsibility per module. Message names and statuses belong in
  `src/shared/messages.js`.
- Keep no state in service worker variables: Chrome suspends the worker when
  idle. Use `chrome.storage` instead.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages, for example `fix: keep the popup in sync after a failed download`.
  The type matters: releases are cut automatically from it (see
  [Releasing](#releasing)), so do not edit the version in `manifest.json` by
  hand.
- A new permission in `manifest.json` needs a justification in the pull
  request and in the README.

## Releasing

Releases are automatic: there is no version to edit and no tag to push. On
every push to `main`, the [release workflow](.github/workflows/release.yml)
runs [semantic-release](https://semantic-release.gitbook.io/), which reads the
commits made since the last release and decides the next version:

| Commit                                         | Release                |
| ---------------------------------------------- | ---------------------- |
| `fix: ...`                                     | patch (1.3.0 to 1.3.1) |
| `feat: ...`                                    | minor (1.3.0 to 1.4.0) |
| `feat!: ...` or a `BREAKING CHANGE:` footer    | major (1.3.0 to 2.0.0) |
| `docs:`, `refactor:`, `test:`, `ci:`, `chore:` | none                   |

It then writes the version to `manifest.json`, commits it to `main`, tags it,
and publishes a GitHub release with generated notes and the packaged
extension, which the download button of the README serves.

semantic-release only runs in CI, through `npx`, so the repository still has
no dependencies. To build the same archive locally (requires `zip`):

```sh
node scripts/package.mjs
```

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).

# Desktop releases

Pushing a version tag that exactly matches the root `package.json` version starts the desktop release workflow. For example, with version `0.1.0`, push `v0.1.0`. The workflow runs type checks, unit tests, and Chromium browser tests, then creates Windows NSIS, Linux AppImage, and macOS DMG packages on their respective hosted runners. It uploads the packages to a GitHub Release with generated notes. The separate CI workflow runs the same checks on pushes and pull requests.

## Optional signing and notarization

Without signing secrets, the workflow creates unsigned packages. Add repository Actions secrets to enable signing:

| Secret | Purpose |
| --- | --- |
| `WINDOWS_CERTIFICATE_BASE64` | Base64-encoded Windows code-signing PFX |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the Windows PFX |
| `MAC_CERTIFICATE_BASE64` | Base64-encoded Developer ID Application `.p12` |
| `MAC_CERTIFICATE_PASSWORD` | Password for the macOS certificate |
| `APPLE_ID` | Apple account used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple account |
| `APPLE_TEAM_ID` | Apple Developer team identifier |

Supply each platform's certificate and password together. Apple notarization credentials must be supplied as a complete set and require the macOS signing certificate. The workflows validate incomplete credential sets and fail instead of silently publishing with unintended signing status. Store certificate material only in repository/organization Actions secrets; do not commit it.

Release tags publish public GitHub Releases. Only push a release tag after reviewing the corresponding commit and confirming the repository's Actions permissions allow release creation.

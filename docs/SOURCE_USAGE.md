# Source Usage Guide

The GitHub repository contains source code, not the full zero-install package.

## Requirements

- Windows 10/11 x64.
- Node.js 24.x with npm: <https://nodejs.org/>.
- A writable project directory.

Check Node.js in PowerShell:

```powershell
node --version
npm --version
```

## Install

Clone the repository:

```powershell
git clone https://github.com/CBBoos0422/anime-search-portable.git
cd anime-search-portable
```

Or use **Code → Download ZIP**, extract the whole archive, and open PowerShell in the extracted folder.

Install and verify:

```powershell
npm ci
npm run check
npm test
```

## Start

```powershell
npm run server
```

The app should open automatically. Otherwise visit <http://127.0.0.1:4173/>. Keep PowerShell open while using the app.

## Choose a Mode

### Search and Copy Only

Choose **Not Now** in the first-run engine prompt. Search and **Copy Magnet** remain available. You can paste the copied link into your own BitTorrent client manually.

### Integrated Downloads

Install the exact qBittorrent version expected by the project:

> [qBittorrent 5.2.3 Download and Setup Guide](QBITTORRENT_SETUP.md)

Anime Search uses only `vendor/qbittorrent/qbittorrent.exe`. It never connects to or stops a separately installed qBittorrent instance.

## Stop

- Choose **Exit App** in the app window; or
- press `Ctrl+C` in PowerShell.

Closing a regular browser tab may leave the local server running.

## Troubleshooting

### `node` or `npm` is not recognized

Install Node.js 24, then reopen PowerShell.

### `ERR_CONNECTION_REFUSED`

Run `npm run server` again. If port `4173` is busy, close the older Anime Search instance first.

### qBittorrent is missing or rejected

Follow [QBITTORRENT_SETUP.md](QBITTORRENT_SETUP.md). The version, file location, and executable hash must match.

### Nyaa times out

Try AnimeGarden, check your internet or proxy, and retry later.

### The directory is read-only

Move the project to a writable user folder and run `npm ci` again.

## Local Data

Local state is stored in the ignored `runtime` directory. Never commit it; it may contain task history, logs, credentials, or local paths.

Use the project only for content you are authorized to obtain and share.

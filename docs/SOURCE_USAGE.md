# Source Repository Usage Guide

This guide explains how to use the files available directly from the GitHub source repository. The source archive is intended for developers and advanced users; it is not the complete zero-install portable package.

## What Works from the Source Repository

After installing Node.js dependencies, source mode provides:

- Nyaa and AnimeGarden search.
- Source selection, filtering, sorting, and result limits.
- Magnet-link copying.
- The local Microsoft-inspired web interface.
- Automated tests and syntax checks.

The integrated download manager, file library, media-player launcher, and Tracker application features require the bundled qBittorrent engine. That binary is intentionally not committed to this repository.

## Requirements

- Windows 10 or Windows 11 x64.
- Node.js 24.x with npm.
- An internet connection for dependency installation and search requests.
- A writable project directory. Avoid extracting the project into a protected system directory.

Node.js should be obtained from its official website: <https://nodejs.org/>.

Confirm the installation in PowerShell:

```powershell
node --version
npm --version
```

The Node.js version should begin with `v24`.

## Download the Source

Either clone the repository:

```powershell
git clone https://github.com/CBBoos0422/anime-search-portable.git
cd anime-search-portable
```

Or choose **Code → Download ZIP** on GitHub, extract the entire archive, and open PowerShell in the extracted directory.

Do not run individual files directly from inside the downloaded ZIP.

## Install and Verify

Run these commands in the repository root:

```powershell
npm ci
npm run check
npm test
```

`npm ci` installs the exact dependency versions recorded in `package-lock.json`. A successful verification currently checks all JavaScript files and runs 27 automated tests.

## Start Anime Search

Run:

```powershell
npm run server
```

Anime Search should open automatically. If it does not, visit:

```text
http://127.0.0.1:4173/
```

Keep the PowerShell window running while using the web interface. Closing that terminal or pressing `Ctrl+C` stops the local server.

## First Run in Source Mode

The first-run dialog asks whether to enable the bundled qBittorrent download engine. A normal source checkout does not include that engine, so choose **Not Now**.

You can then:

1. Select Nyaa, AnimeGarden, or All Sources.
2. Enter a title or release-group keyword.
3. Open **Filters & Sorting** if needed.
4. Select **Search**.
5. Use **Copy Magnet** on a result.

You may paste the copied magnet link into a separately installed BitTorrent client yourself. Anime Search will not automatically connect to, configure, or close a system-installed qBittorrent instance.

## Integrated Download Features

The repository does not include `vendor/qbittorrent`, `vendor/node`, `node_modules`, or personal runtime data. This keeps Git history small and prevents third-party binaries, passwords, logs, and download records from being published.

The integrated engine expects exactly:

```text
vendor/qbittorrent/qbittorrent.exe
```

The current source is pinned to qBittorrent 5.2.3 and verifies the executable with this SHA-256 value:

```text
f69360ae8545a64f4fc84fb6bacef03d77a6aa0793a4c14d4a28651ca26a27d1
```

Installing qBittorrent elsewhere on Windows is deliberately not enough. This isolation prevents Anime Search from taking over or stopping a user's own qBittorrent installation.

For a fully integrated experience, use a complete portable ZIP published in GitHub Releases, or follow the maintainer-oriented build reference in `scripts/build-portable.ps1`. The portable launcher command is intended only for a complete portable directory:

```powershell
npm run start:portable
```

## Stop the Application

- In the dedicated app window, choose **Exit App** to stop the local web service and any engine started by Anime Search.
- In source mode, you may also return to PowerShell and press `Ctrl+C`.
- Closing only a regular browser tab does not necessarily stop the local server.

## Troubleshooting

### `npm` or `node` is not recognized

Install Node.js 24 from the official website, then close and reopen PowerShell.

### `ERR_CONNECTION_REFUSED` at `127.0.0.1:4173`

The local server is not running. Return to the project directory and run:

```powershell
npm run server
```

If the terminal reports that port `4173` is already in use, close the older Anime Search instance before retrying.

### The bundled qBittorrent executable is missing

This is expected in a source-only checkout. Choose **Not Now** in the engine prompt and use search or magnet-copy features. Do not enable integrated downloads until a complete portable engine directory is available.

### Nyaa times out or resets the connection

Try AnimeGarden, check your internet or proxy application, and retry later. Third-party source availability is outside this project's control.

### The project directory is read-only

Move or extract the repository to a writable user directory, then run `npm ci` again.

## Runtime Data and Privacy

The app creates an ignored `runtime` directory for local state. Do not commit it. It may contain browser state, qBittorrent configuration, task history, logs, or local paths.

Use Anime Search only for content you are authorized to obtain and share. Follow applicable law, source-site rules, and copyright licenses.

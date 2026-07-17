# Anime Search

[![CI](https://github.com/CBBoos0422/anime-search-portable/actions/workflows/ci.yml/badge.svg)](https://github.com/CBBoos0422/anime-search-portable/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A lightweight Windows app for searching Nyaa and AnimeGarden, copying magnet links, and managing downloads through a local qBittorrent engine.

![Anime Search light theme](docs/images/anime-search-home.png)

## Features

- Search Nyaa, AnimeGarden, or both.
- Copy magnet links or download through qBittorrent.
- Choose download folders and manage tasks from the web interface.
- Browse grouped files, launch media, and manage Trackers.

## Quick Start

Requirements: Windows 10/11 x64 and Node.js 24.

```powershell
git clone https://github.com/CBBoos0422/anime-search-portable.git
cd anime-search-portable
npm ci
npm test
npm run server
```

Open <http://127.0.0.1:4173/> if the app does not open automatically.

- For search and magnet copying only, choose **Not Now** when asked to enable the engine.
- For integrated downloads, follow the [qBittorrent 5.2.3 Setup Guide](docs/QBITTORRENT_SETUP.md).

## Repository Modes

| Mode | What you need |
| --- | --- |
| Source mode | Node.js 24; search and magnet copying work immediately |
| Integrated downloads | Node.js 24 plus qBittorrent 5.2.3 in `vendor/qbittorrent` |
| Full portable build | Bundled Node.js, qBittorrent, dependencies, and launchers |

The source repository excludes binaries, dependencies, runtime state, logs, and download history.

## Documentation

- [Source Usage Guide](docs/SOURCE_USAGE.md)
- [qBittorrent 5.2.3 Download and Setup](docs/QBITTORRENT_SETUP.md)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)

## Commands

```powershell
npm run server       # Start from source
npm run check        # Check JavaScript syntax
npm test             # Run tests
npm run start:portable  # Complete portable directory only
```

## Legal Use

Use this project only for content you are authorized to obtain and share. The project does not host content or guarantee third-party availability.

## License

Project code: [MIT](LICENSE), copyright `CBBoos0422`. Third-party components keep their original licenses.

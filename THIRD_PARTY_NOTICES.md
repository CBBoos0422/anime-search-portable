# Anime Search Third-Party Notices

Anime Search 1.2.0 invokes the following third-party software as separate components. Complete license texts are available in the `licenses` directory.

## qBittorrent 5.2.3

- Project: https://github.com/qbittorrent/qBittorrent
- License: GNU General Public License v2 or later, including the OpenSSL linking exception listed in the project's `COPYING` file.
- The portable package does not modify the qBittorrent binary. It communicates with qBittorrent only through a loopback-only Web API.
- This source repository does not commit the source archive. Matching source is available from the `release-5.2.3` tag in the official qBittorrent repository.
- A complete portable release should attach `sources/qbittorrent-5.2.3.tar.xz` to the same GitHub Release so recipients can obtain source matching the distributed binary.
- Official source SHA-256: `7573621859da7287ba708378ea9f5eb12f30962a1a7c28eba5f44ecf8c4c114c`

## Node.js 24.18.0 LTS

- Project: https://nodejs.org/
- License: the Node.js license and its bundled third-party component terms; see `licenses/Node.js-LICENSE.txt`.
- Bundled `node.exe` SHA-256: `9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de`

## Nyaapi 2.4.4

- Project: https://github.com/Kylart/Nyaapi
- License: MIT; see `licenses/Nyaapi-LICENCE.txt`.

## AnimeGarden Public API

- Project: https://github.com/yjl9903/AnimeGarden
- API: https://api.animes.garden
- This project calls public resource and detail endpoints only. It does not copy or bundle AnimeGarden server code.

## Online Tracker List

- Project: https://github.com/XIU2/TrackersListCollection
- At the user's request, the app reads the public daily `best.txt` list. Each Tracker endpoint remains operated by its respective provider.

Portable builds also collect license files shipped with production dependencies under `licenses/npm`. Copyright in every third-party component remains with its respective owner.

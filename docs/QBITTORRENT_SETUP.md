# qBittorrent 5.2.3 Download and Setup

Anime Search is pinned to the standard Windows x64 build of qBittorrent 5.2.3: Qt6 with libtorrent 1.2.x. Do **not** use the `lt20` installer or another version.

## Official Downloads

- [Official qBittorrent download page](https://www.qbittorrent.org/download)
- [qBittorrent 5.2.3 Windows x64 installer](https://sourceforge.net/projects/qbittorrent/files/qbittorrent-win32/qbittorrent-5.2.3/qbittorrent_5.2.3_x64_setup.exe/download)
- [Installer PGP signature](https://sourceforge.net/projects/qbittorrent/files/qbittorrent-win32/qbittorrent-5.2.3/qbittorrent_5.2.3_x64_setup.exe.asc/download)
- [qBittorrent 5.2.3 release notes and source assets](https://github.com/qbittorrent/qBittorrent/releases/tag/release-5.2.3)
- [Official qBittorrent 5.2.3 source tarball](https://sourceforge.net/projects/qbittorrent/files/qbittorrent/qbittorrent-5.2.3/qbittorrent-5.2.3.tar.xz/download)

## Verify the Installer

The official SHA-256 for `qbittorrent_5.2.3_x64_setup.exe` is:

```text
ff508e2f912d59c9eabaf03633ebacfd45c2049f38dcac027b8a7d7ad867ab2f
```

In PowerShell, replace the path if necessary:

```powershell
Get-FileHash "$HOME\Downloads\qbittorrent_5.2.3_x64_setup.exe" -Algorithm SHA256
```

Continue only if the result matches exactly.

## Install into the Repository

1. Close Anime Search.
2. Create this directory inside the repository:

   ```text
   anime-search-portable\vendor\qbittorrent
   ```

3. Run `qbittorrent_5.2.3_x64_setup.exe`.
4. On the destination-folder page, choose the repository directory created above instead of the normal system location.
5. Finish the installer, but do not launch qBittorrent manually.

The result must contain at least:

```text
anime-search-portable\
└─ vendor\
   └─ qbittorrent\
      ├─ qbittorrent.exe
      ├─ qt.conf
      └─ translations\
```

Keep the installed runtime files together. Do not copy only `qbittorrent.exe` from another installation.

## Verify the Executable

From the repository root, run:

```powershell
Get-FileHash ".\vendor\qbittorrent\qbittorrent.exe" -Algorithm SHA256
```

Anime Search expects:

```text
f69360ae8545a64f4fc84fb6bacef03d77a6aa0793a4c14d4a28651ca26a27d1
```

If it differs, the app will refuse to start the engine.

## Start Integrated Downloads

Install Node.js dependencies if needed, then start the source server:

```powershell
npm ci
npm run server
```

In the first-run dialog:

1. Read the license and lawful-use notice.
2. Select the confirmation checkbox.
3. Choose **Confirm & Enable**.

qBittorrent then runs as a hidden background process managed by Anime Search. Its configuration is stored in the project's ignored `runtime` directory.

## Source Archive for Redistribution

Normal source users do not need the qBittorrent source tarball. If you redistribute a portable package containing qBittorrent, download the matching source archive above and place it at:

```text
sources\qbittorrent-5.2.3.tar.xz
```

Expected source SHA-256:

```text
7573621859da7287ba708378ea9f5eb12f30962a1a7c28eba5f44ecf8c4c114c
```

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for licensing details.

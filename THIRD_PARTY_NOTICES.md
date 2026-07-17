# Anime Search 第三方软件声明

Anime Search 1.2.0 以独立进程方式调用以下第三方软件。完整许可证文件位于 `licenses` 目录。

## qBittorrent 5.2.3

- 项目：https://github.com/qbittorrent/qBittorrent
- 许可：GNU General Public License v2 or later，并包含项目 `COPYING` 中列出的 OpenSSL 链接例外。
- 本便携包不修改 qBittorrent 二进制文件，仅通过仅限本机的 Web API 与其通信。
- 源码仓库不提交该压缩包；可从 qBittorrent 官方仓库的 `release-5.2.3` 标签获取对应源代码。
- 若发布完整便携包，应在同一 GitHub Release 中附带 `sources/qbittorrent-5.2.3.tar.xz`，以便接收者取得与二进制匹配的完整源代码。
- 官方源代码 SHA-256：`7573621859da7287ba708378ea9f5eb12f30962a1a7c28eba5f44ecf8c4c114c`

## Node.js 24.18.0 LTS

- 项目：https://nodejs.org/
- 许可：Node.js 许可证及其随附第三方组件条款，详见 `licenses/Node.js-LICENSE.txt`。
- 内置 `node.exe` SHA-256：`9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de`

## Nyaapi 2.4.4

- 项目：https://github.com/Kylart/Nyaapi
- 许可：MIT，详见 `licenses/Nyaapi-LICENCE.txt`。

## AnimeGarden 开放 API

- 项目：https://github.com/yjl9903/AnimeGarden
- API：https://api.animes.garden
- 本项目只调用其公开资源与详情接口，不复制或内置 AnimeGarden 服务端代码。

## Tracker 在线列表

- 项目：https://github.com/XIU2/TrackersListCollection
- 本项目按用户操作读取其公开的 `best.txt` 每日列表；列表内容由对应 Tracker 运营者提供。

发布包还会在 `licenses/npm` 中收集随生产依赖提供的许可证文件。各组件版权归其各自权利人所有。

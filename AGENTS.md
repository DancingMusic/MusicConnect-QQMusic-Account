# MusicConnect QQ Music Account Instructions

本仓库只实现 QQ 音乐账号变体。开始修改前必须阅读 `README.md` 与
`openspec/CONNECTOR_OPENSPEC.md`。

## 边界

- 实现 ID 固定为 `qq-music-account`，通过 `familyId: qq-music` 与匿名版归组。
- 登录凭据由 DancingMusic 宿主持久化；连接器只在 `init()` 与
  `login().request.input` 中接收当前运行所需的秘密。
- Cookie、Token、密码和密钥不得出现在 `configPatch`、URL、日志、错误信息、
  GitHub Pages、测试快照或可持久化的公开配置中。
- 用户配置的目录网关永远是无凭据通道，不得收到 QQ 音乐 Cookie。
- 只声明已经实现且经过测试的能力。账号收藏、会员播放等能力在具备合规的
  官方域请求代理前不得声明。

## 验证

提交前运行：

```bash
npm test
npm run build
```

必须提交与源码一致的 `dist/index.js` 和 `dist/index.d.ts`，但不得提交本机凭据。

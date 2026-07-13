# OpenSpec: QQ Music Account Connector

- Spec-ID: `qq-music-account-connector`
- Version: `1.0.0`
- Status: `Active`
- Last-Updated: `2026-07-12`

## Scope

本仓库提供 DancingMusic 的 QQ 音乐账号连接器。它与
`MusicConnect-QQMusic` 匿名实现独立发布，但共享 `familyId: qq-music`。

首版提供：

- QQ 音乐官方网页扫码登录描述与桌面端 Cookie 捕获契约
- 手机端通过受信任桌面设备同步使用账号能力
- 登录状态、继续、取消和退出意图
- 扫码后通过宿主受控代理访问 QQ 官方域曲库接口
- 无需用户填写 Base URL 的搜索、歌曲、播放地址和账号歌单

账号 Cookie 仅由宿主官方域代理使用，不进入第三方网关、连接器配置或 URL。
首版不承诺会员解锁；不可播放的版权内容允许返回空播放地址。

## Connector Identity

连接器元数据 MUST 为：

- `id: qq-music-account`
- `familyId: qq-music`
- `variant: account`
- `authRequirement: required`
- `supportedHosts: [desktop]`
- capabilities: `search`, `stream`, `playlist`, `login`

## Login Flow

`login({ intent: "start" })` MUST 返回 `browser` 流程和带
`cookieCapture.provider: qq-music` 的官方 QQ 音乐 `open-url` action。桌面宿主在
隔离窗口打开官方页面，用户通过页面扫码，宿主捕获所需 Cookie 后调用：

```ts
login({
  intent: "continue",
  flowId: "qq-music-account-web-cookie",
  input: { cookie: "..." },
})
```

Web 和手机宿主不能跨站读取 QQ 音乐 HttpOnly Cookie，因此 MUST NOT 安装本账号变体；
手机通过受信任桌面设备同步使用账号能力。公开 Pages MUST NOT 提供凭据输入或保存功能。

连接器 MUST 验证 Cookie 中存在 QQ/微信账号标识及可用的音乐会话键。无效凭据返回
`error`；有效凭据返回 `authenticated`。

## Credential Boundary

- 宿主是凭据唯一持久化方，并按安装 ID 隔离安全存储。
- 连接器 MAY 从 `init({ cookie })` 和 `request.input.cookie` 接收运行时秘密。
- 登录结果 MUST NOT 通过 `configPatch` 返回 Cookie 或任何其他秘密。
- 退出登录只清除连接器内存状态；宿主负责清空持久化凭据并重新初始化连接器。
- Cookie MUST NOT 被附加到目录网关 URL、header 或 body。
- Cookie MUST NOT 被发送到任何用户配置或第三方网关。
- 目录请求只包含文档规定的非敏感查询参数。

## Catalog Gateway

账号实现 MUST NOT 暴露 `apiBaseUrl`。登录完成后，连接器向声明过的 QQ 官方 HTTPS
origin 发起请求；宿主在隔离的 `qq-music` session 中执行请求并自动附带该 session 的
Cookie。宿主 MUST 校验连接器安装 ID、HTTP 方法和目标 origin，禁止重定向或转发到
第三方域。Web 与 Mobile 不提供此代理，而是通过受信任桌面设备同步账号能力。

## Verification

契约测试 MUST 覆盖元数据、官方网页登录 action、有效/无效 Cookie、宿主注入状态、
退出流程、无敏感 `configPatch`，以及目录请求绝不携带 Cookie。

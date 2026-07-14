# OpenSpec: QQ Music Account Connector

- Spec-ID: `qq-music-account-connector`
- Version: `1.1.1`
- Status: `Active`
- Last-Updated: `2026-07-14`

## Scope

本仓库提供 DancingMusic 的 QQ 音乐账号连接器。它与
`MusicConnect-QQMusic` 匿名实现独立发布，但共享 `familyId: qq-music`。

首版提供：

- QQ 音乐官方网页扫码登录描述与桌面端 Cookie 捕获契约
- 手机端通过受信任桌面设备同步使用账号能力
- 登录状态、继续、取消和退出意图
- 扫码后通过宿主受控代理访问 QQ 官方域曲库接口
- 无需用户填写 Base URL 的搜索、歌曲、播放地址和账号歌单
- 结构化会员状态、歌曲会员/版权/地区可用性标识
- QQ 官方歌词与翻译歌词
- 保留受限歌曲的分页歌单详情

账号 Cookie 仅由宿主官方域代理使用，不进入第三方网关、连接器配置或 URL。
连接器不承诺绕过平台权限，但 MUST 使用宿主返回的真实会员状态和当前登录会话
请求会员可用的官方播放地址。不可播放歌曲 MUST 保留在列表中，并通过 access
元数据说明会员、版权、地区或未知限制，不得在目录映射阶段直接过滤。

播放地址解析 MUST 将曲目 `file.media_mid` 传给宿主，允许宿主按无损到 AAC
构造多个官方 vkey 文件名候选；连接器 MUST 跳过空 `purl` 并选择第一个可播结果。
会员曲目解析失败时，错误必须区分登录会话过期、会员权限不足和平台未返回播放地址。
歌词通过宿主审核的 `qq.track.lyrics` 操作读取，连接器负责解码并返回 MusicConnect
标准 `MusicLyrics`，不得把 Cookie 或原始响应泄露给 UI。

账号标识解析 MUST 与宿主保持一致：当 Cookie 的 `login_type=2` 时优先使用
`wxuin`，否则优先使用 `uin` / `qqmusic_uin`。资料响应中的账号 Map 未命中时，
连接器 MUST 保留“会员状态未知”，不得把解析失败伪装成普通账号。只有响应中明确
包含当前账号的会员记录且所有已知会员位均未启用时，才可返回“普通账号”。昵称与
头像 MUST 兼容 QQ 官方资料响应的常用字段，并统一把官方头像 URL 升级为 HTTPS。

歌曲权限映射 MUST 优先保留 `pay.pay_play` / `pay.payplay` 表示的 VIP 要求，不能
因为同一曲目存在试听片段就把 VIP 曲目标成普通试听。试听范围 MUST 从 `file` 下的
`try_begin`、`try_end` 与 `size_try` 读取。若响应明确包含完整音频大小字段且全部为
零，连接器 MUST 标记为 `unavailable`，不得把未知原因直接宣称为无版权。

## Connector Identity

连接器元数据 MUST 为：

- `id: qq-music-account`
- `familyId: qq-music`
- `variant: account`
- `authRequirement: required`
- `supportedHosts: [desktop]`
- capabilities: `search`, `stream`, `lyrics`, `playlist`, `login`, `user-library`, `recommendations`

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
QQ 与微信登录账号标识、官方资料 Map 命中/未命中、会员与头像映射、VIP/试听/零音频
权限优先级、退出流程、无敏感 `configPatch`，以及目录请求绝不携带 Cookie。

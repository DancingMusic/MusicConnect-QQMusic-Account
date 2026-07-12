# MusicConnect-QQMusic-Account

QQ 音乐的 DancingMusic **账号连接器实现**。

- 实现 ID：`qq-music-account`
- 家族 ID：`qq-music`
- 变体：`account`
- 登录要求：`required`
- 能力：官方网页扫码登录、搜索、歌曲、可用时的播放地址、歌单
- 主机：Desktop

匿名目录实现仍由独立仓库
[`MusicConnect-QQMusic`](https://github.com/DancingMusic/MusicConnect-QQMusic) 提供。
两个实现可以同时安装，宿主通过共同的 `familyId` 展示为同一平台的不同方式。

## 傻瓜式登录

用户点击登录后，连接器要求宿主打开 QQ 音乐官方页面：

```text
https://y.qq.com/n/ryqq/profile
```

桌面端在隔离的官方登录窗口中展示 QQ 音乐自己的二维码。用户扫码确认后，DancingMusic
宿主捕获必要 Cookie，写入当前连接器安装 ID 对应的系统安全凭据库，再把凭据注入连接器。
用户不需要填写 API Key 或手动复制 Cookie。

Web 和手机端不能跨域读取 QQ 音乐 HttpOnly Cookie，因此账号实现不在这些运行环境中安装；
手机通过 DancingMusic 设备同步使用已信任桌面端的账号能力。GitHub Pages 不收集、不保存真实账号凭据。

## 安全边界

- Cookie 只从宿主的 `init({ cookie })` 或 `login().request.input.cookie` 进入运行时。
- 登录结果不会通过 `configPatch` 返回 Cookie。
- Cookie 不会写入 URL、日志、Pages、公开配置或浏览器 `localStorage`。
- Cookie 绝不会发送到下面的用户自定义目录网关。
- 退出、卸载和重置时由宿主清理持久化凭据。

## 可选目录网关

QQ 音乐没有面向普通第三方应用的通用公开目录 REST API。若需要搜索和播放地址，用户
可配置自己信任并维护的、兼容下列无凭据契约的 HTTPS 网关：

```json
{
  "apiBaseUrl": "https://your-qqmusic-gateway.example.com"
}
```

- `GET /search?key=...&pageNo=...&pageSize=...`
- `GET /song?songmid=...`
- `GET /song/url?id=...`
- `GET /top/playlist?pageNo=...&pageSize=...&sortId=...`
- `GET /playlist?id=...`

未配置网关时目录能力返回空结果。账号 Cookie 不会解锁或增强此网关；账号收藏、会员
播放和个性化推荐尚未声明，后续必须通过宿主允许的官方域请求代理实现。

## 开发与发布

```bash
npm install
npm test
npm run build
```

固定版本加载地址：

```text
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-QQMusic-Account@v0.1.0/dist/index.js
```

统一文档：[DancingMusic Docs](https://dancingmusic.github.io/docs/)

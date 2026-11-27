# 社交媒体发帖效果追踪台账

> 目的：量化评估每个渠道发帖后的**外站曝光互动**与**站内引流/订阅转化**，用于筛选高 ROI 渠道与高转化文案模板。

---

## 一、渠道 UTM 链接规范

发布到各平台时统一使用带 UTM 参数的链接，便于在 **Vercel Analytics** 中按来源拆解 UV 与转化：

| 平台 | 标准 UTM 链接 |
| :--- | :--- |
| **X (Twitter)** | `https://agentcases-ai.vercel.app/?utm_source=x&utm_medium=social&utm_campaign=week1_launch` |
| **Threads** | `https://agentcases-ai.vercel.app/?utm_source=threads&utm_medium=social&utm_campaign=week1_launch` |
| **Reddit** | `https://agentcases-ai.vercel.app/?utm_source=reddit&utm_medium=social&utm_campaign=week1_launch` |
| **小红书** | `https://agentcases-ai.vercel.app/?utm_source=xiaohongshu&utm_medium=social&utm_campaign=week1_launch` |

> 注：后续第 2 周切片内容可将 `utm_campaign` 改为 `week2_slice_01`、`week2_slice_02` 等，精确追踪单篇爆款贡献。

---

## 二、已发布帖子追踪记录

### 1. 第 1 周首发贴（Week 1 Launch）

| 平台 | 帖子链接 | 发布时间 | 追踪节点 | 曝光 (Views) | 点赞 | 转发 | 评论 | 书签 | 站内新增 UV / 订阅 | 备注 |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **X (Twitter)** | [status/2125513689415708910](https://x.com/xz20p36di098582/status/2125513689415708910) | 2026-11-25 16:55 | 24h (11-26 10:00) | 3 | 0 | 0 | 0 | 0 | 待核对 Vercel/KV | 含首页截图；新号冷启动自然流量极低，建议转评互动或配大V评论区曝光 |
| **X (Twitter)** | [status/2125513689415708910](https://x.com/xz20p36di098582/status/2125513689415708910) | 2026-11-25 16:55 | 48h (11-27 10:00) | 7 | 0 | 0 | 0 | 0 | 待核对 Vercel/KV | 较昨日 +4 Views，互动仍为 0；建议发布第 1 周 Threads/Reddit/小红书并做评论区引流 |
| **Threads** | 待发布 | - | 24h / 72h / 7d | - | - | - | - | - | - | 使用 `utm_source=threads` |
| **Reddit** | 待发布 | - | 24h / 72h / 7d | - | - | - | - | - | - | 使用 `utm_source=reddit` |
| **小红书** | 待发布 | - | 24h / 72h / 7d | - | - | - | - | - | - | 使用 `utm_source=xiaohongshu` |

---

## 三、追踪与复盘节奏

1. **24 小时初检**：查看 X Analytics（`/analytics`）曝光与点击率，以及 Vercel Analytics 过去 24h 来源流量（`t.co` / UTM）；若评论区有提问，第一时间回复并置顶补充站点亮点。
2. **72 小时复盘**：记录 72h 互动峰值与新增邮件订阅数，判断该文案钩子是否值得复用或二次改写。
3. **7 天周报**：对比各平台 **单帖平均引流 UV** 与 **访客→订阅转化率**，淘汰低效渠道，加码高转化渠道。

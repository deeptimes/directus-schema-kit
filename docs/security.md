# 安全边界

- `build` 会执行可信的项目 TypeScript DSL，不是安全沙箱。
- `plan/apply` 只读取 JSON Manifest，不动态执行 TypeScript。
- 仅允许连接 localhost、RFC1918 私网和 `.local` 地址。
- token、secret 和数据库凭证不得进入 Manifest、普通日志或 JSON 报告。
- 普通 apply 不执行字段删除、集合删除、类型变化或关系目标变化。
- 系统资源删除必须显式 `delete: true` 并提供 `--confirm-destructive`。
- clear 在交互式终端中必须先展示计划并通过默认否定的 `y/N` 确认；非交互真实删除必须同时提供相同 module/scope 和 `--confirm`，且永远拒绝 `directus_*`。
- 网络重试有次数上限；确定性 4xx 和 DELETE 不自动重试。
- 工具不提供事务回滚，部分成功会明确报告 completed、failed 和 notExecuted。

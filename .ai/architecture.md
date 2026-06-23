# DSK 技术架构

## 分层

1. DSL：可信 TypeScript 源码，仅由 `dsk build` 通过 jiti 执行。
2. Manifest：确定性 JSON 交换格式，包含源码 SHA-256 摘要。
3. Validation：离线检查 Manifest、seed 和源码新鲜度。
4. Plan Engine：纯函数比较 Manifest 与 Directus 当前状态。
5. Directus Adapter：`DirectusReader` 只提供 GET；`DirectusWriter` 只提供明确的安全写方法。
6. CLI：参数、文本/JSON 输出和退出码，不承载差异业务逻辑。

## Plan 安全规则

- `create`：目标资源不存在；低风险，可由未来普通 apply 执行。
- `update`：仅命中 collection/field UI Meta 白名单或字段默认值；低风险。
- `unchanged`：目标声明的属性一致。
- `conflict`：存在已声明但不在安全白名单内的差异；不可自动执行。
- `dangerous`：字段类型、数据库约束、关系目标或删除策略发生变化；不可自动执行。

Plan 只比较 Manifest 明确声明的属性，不把实例额外属性或额外资源推断为删除。

## 连接边界

- 从 Directus 项目 `.env` 或 shell 读取 `DIRECTUS_URL`、`DIRECTUS_TOKEN`。
- token 不进入 Plan、日志或错误摘要。
- 当前版本只允许回环、RFC1918 私网和 `.local` 地址。
- collections、fields、relations 并发读取，写入能力使用独立 Adapter 实现。

## Apply 执行规则

- 写入前生成完整 Plan；存在 conflict/dangerous 时不执行任何写入。
- 顺序固定为 group、collection、field、relation；写操作不并发。
- 新集合的主键字段随 collection POST 创建，字段步骤只记录完成，不重复请求。
- update 请求只包含 Plan 中变化的白名单属性，不发送完整对象。
- 429、502、503、504、超时和网络错误最多重试三次；确定性 4xx 不重试。
- 首项失败后停止，报告 completed、failed 和 notExecuted。

## Seed、系统资源和 Clear

- Seed 仅接受版本化 JSON，按文件名、批次和 item 确定性执行；自然键索引分页加载。
- Seed 引用优先使用本次执行缓存，再查询实例；无法解析立即停止当前运行。
- 系统资源使用 DSL `key` 作为引用键，并以类型特定业务字段匹配实例；`$ref` 通过拓扑排序解析为 ID。Directus 11.17.4 按 roles → policies → access → permissions 建立权限链路。
- 系统资源删除必须在定义中显式标记 `delete: true`，并额外提供 `--confirm-destructive`。
- Clear 只接受完整 Manifest，默认仅计划；真实删除需要交互确认或非交互 `--confirm`，并永远排除 `directus_*`。
- Clear 永远拒绝 `directus_*`，先删除关系字段，再按子到父顺序删除集合，最后删除 group。

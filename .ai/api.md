# Plan API 契约

`createPlan(manifest, state, targetUrl, databaseClient?)` 返回 `planVersion: 1`，始终比较完整 Manifest：

- `manifestDigest`：目标 Manifest 的源码摘要。
- `target.url`：只保留 Directus origin，不包含凭证。
- `operations[]`：包含 source、resourceType、resource、action、risk、executable、changes 和可选 reason。
- `summary`：五种 action 的稳定计数对象。

CLI 从 Directus 项目的 `.env` 读取 `DB_CLIENT` 并传给 Plan。仅当 `DB_CLIENT=sqlite3` 时，Directus 返回的 `float + numeric_precision=null + numeric_scale=null` 与 Manifest 的 `decimal` 视为同一种 SQLite 表示；其他数据库仍将 `float/decimal` 或精度差异标记为 dangerous。该兼容规则只消除重复 Plan 的误报，不表示 SQLite 浮点字段具备十进制定点精度。

CLI：

```bash
dsk plan [--format text|json]
```

退出码：成功且无阻断差异为 0；构建或校验失败为 2；存在 conflict/dangerous 为 3；连接或执行失败为 4；配置错误为 5。

## Apply API 契约

`executeApply({ manifest, plan, writer, dryRun })` 返回 `applyVersion: 1`，状态为 success、blocked 或 failed，并包含 completed、failed、notExecuted、blocked 和 skippedUnchanged。

```bash
dsk apply [--dry-run] [--format text|json]
```

## Seed、Resources、Clear

```bash
dsk seed [path] [--dry-run|--plan]
dsk resources apply [--dry-run] [--confirm-destructive]
dsk clear [--dry-run]
dsk clear --confirm
```

Seed 返回版本化 create/update/unchanged 计数。Resource Sync 返回 create/update/unchanged/delete/conflict 操作；delete 默认阻断。Clear 返回 planned/success/blocked/failed，并逐项报告完成和失败。交互式文本终端先展示全部自定义 Schema 的计划并以 `y/N` 确认；非交互或 JSON 输出只计划，脚本执行必须提供 `--confirm`。

Directus 11.17.4 权限定义需要分别声明 role、policy、access 和 permission，并通过 `$ref` 连接稳定业务键。

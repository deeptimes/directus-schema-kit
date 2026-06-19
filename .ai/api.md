# Plan API 契约

`createPlan(manifest, state, targetUrl, moduleFilter?)` 返回 `planVersion: 1`：

- `manifestDigest`：目标 Manifest 的源码摘要。
- `target.url`：只保留 Directus origin，不包含凭证。
- `operations[]`：包含 module、resourceType、resource、action、risk、executable、changes 和可选 reason。
- `summary`：五种 action 的稳定计数对象。

CLI：

```bash
dsk plan [--module <id>] [--format text|json]
```

退出码：成功且无阻断差异为 0；存在 conflict/dangerous 为 3；连接或执行失败为 4；配置错误为 5。

## Apply API 契约

`executeApply({ manifest, plan, writer, dryRun })` 返回 `applyVersion: 1`，状态为 success、blocked 或 failed，并包含 completed、failed、notExecuted、blocked 和 skippedUnchanged。

```bash
dsk apply [--module <id>] [--dry-run] [--format text|json]
```

## Seed、Resources、Clear

```bash
dsk seed [path] [--dry-run|--plan]
dsk resources apply [--dry-run] [--confirm-destructive]
dsk clear --module <id> [--confirm --scope <id>]
```

Seed 返回版本化 create/update/unchanged 计数。Resource Sync 返回 create/update/unchanged/delete/conflict 操作；delete 默认阻断。Clear 返回 planned/success/blocked/failed，并逐项报告完成和失败。

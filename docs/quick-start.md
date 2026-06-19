# 快速开始

前提：Node.js 22+、Directus 11.17.4，且项目 `.env` 包含 `DIRECTUS_URL` 和具备管理权限的 `DIRECTUS_TOKEN`。

```bash
pnpm add -D @deeptimes/directus-schema-kit
pnpm dsk init
pnpm dsk doctor
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk seed --plan
pnpm dsk seed
pnpm dsk resources apply --dry-run
pnpm dsk resources apply
```

第二次 `plan` 应不存在可执行差异。`clear` 默认只生成计划；真实清理必须同时提供：

```bash
pnpm dsk clear --module content --confirm --scope content
```

V1 不包含 Flow、Operation、Dashboard、Panel 或旧教学中心数据迁移。

# 快速开始

## 前提

- Node.js 22+
- Directus 11.17.4 + SQLite
- pnpm
- Directus 项目 `.env` 中包含 `DIRECTUS_URL` 和具备管理权限的 `DIRECTUS_TOKEN`

DSK 只允许连接 localhost、私网 IP 和 `.local` 地址，不用于生产实例发布。

## 初始化与首次应用

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

`init` 不会覆盖已有文件。生成的工作区结构如下：

```text
dsk/
  config.json
  schemas/
  resources/
  seeds/
  generated/manifest.json
.ai/
  directus-schema-kit.md
```

人工维护 `schemas/`、`resources/`、`seeds/`、`config.json` 和 `.ai/directus-schema-kit.md`；`generated/manifest.json` 由 `build` 生成，不要手工修改。

首次 Apply 后再次执行：

```bash
pnpm dsk plan
```

结果应不存在可执行差异。

## 清理本地 Schema

`clear` 只用于初始化阶段或一次性本地实例。人工执行会先展示全部自定义 Schema 的删除计划，再要求 `y/N` 确认：

```bash
pnpm dsk clear
```

只查看计划使用 `--dry-run`。CI 或脚本不进行交互，真实清理必须显式确认：

```bash
pnpm dsk clear --dry-run
pnpm dsk clear --confirm
```

`clear` 永不删除 `directus_*` 系统集合，也不支持按文件局部清理。

## 当前边界

DSK 不支持 Flow、Operation、Dashboard、Panel、字段类型迁移、存量数据迁移或跨环境发布。普通 `apply` 不执行删除。

下一步阅读 [Schema DSL](./schema-dsl.md)；命令参数见 [CLI 参考](./cli-reference.md)。

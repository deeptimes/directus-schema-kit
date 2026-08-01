# Directus Schema Kit (DSK)

Directus Schema Kit 是面向 Directus 本地开发项目的声明式 Schema Provisioning 工具。TypeScript DSL 负责人工编写，版本化 JSON Manifest 负责校验、规划和执行边界。

CLI 接受 Directus 11.x 与 12.x。当前认证环境为 Node.js 22+、Directus 11.17.4 和 SQLite；Directus 12.2.0 尚待独立集成测试认证。

## 当前实现

- 固定、严格类型的 `collection()`、`field.*()`、`env()`、`ref()` DSL。
- `dsk init`：识别 Directus 项目，幂等创建统一的 `dsk/` 工作区，支持 `--dry-run`。
- `dsk build`：确定性加载目录化 DSL，展开字段关系并生成带 SHA-256 源码摘要的 Manifest。
- `dsk build --check`：检查 Manifest 是否最新，不写文件。
- `dsk validate`：离线校验配置、Manifest 语义、源码新鲜度和 JSON seed。
- `dsk plan`：只读获取本地 Directus 状态，分类 create、update、unchanged、conflict 和 dangerous。
- `dsk apply`：全量预检后按依赖顺序执行安全 create/update，默认阻断 conflict/dangerous。
- `dsk seed`：严格 JSON Seed，自然键 upsert、跨集合/同集合引用以及 plan/apply。
- `dsk resources apply`：folders、roles、policies、access、permissions、presets 同步。
- `dsk clear`：全量自定义 Schema 清理计划、交互确认、系统集合硬保护及非交互 `--confirm`。
- `--cwd`、`--config`、`--format json` 与稳定错误退出码。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## 项目内使用

安装后在 Directus 项目中执行：

```bash
pnpm dsk init
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk seed --dry-run
pnpm dsk seed --plan
pnpm dsk seed
pnpm dsk resources apply --dry-run
pnpm dsk clear
pnpm dsk clear --dry-run
pnpm dsk clear --confirm
```

`build` 会执行可信的项目 TypeScript 源码；后续 `plan/apply` 执行层只允许消费 `dsk/generated/manifest.json`。

详细文档从 [文档首页](docs/README.md) 开始，也可直接查看 [快速开始](docs/quick-start.md)、[CLI 参考](docs/cli-reference.md)、[Schema DSL](docs/schema-dsl.md)、[Manifest V1](docs/manifest.md) 和 [兼容性](docs/compatibility.md)。

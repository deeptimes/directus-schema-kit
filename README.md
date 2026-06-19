# Directus Schema Kit (DSK)

Directus Schema Kit 是面向 Directus 本地开发项目的声明式 Schema Provisioning 工具。TypeScript DSL 负责人工编写，版本化 JSON Manifest 负责校验、规划和执行边界。

## 当前实现

- 固定、严格类型的 `collection()`、`field.*()`、`env()`、`ref()` DSL。
- `dsk init`：识别 Directus 项目，幂等创建 `dsk/` 与 `.dsk/`，支持 `--dry-run`。
- `dsk build`：确定性加载目录化 DSL，展开字段关系并生成带 SHA-256 源码摘要的 Manifest。
- `dsk build --check`：检查 Manifest 是否最新，不写文件。
- `dsk validate`：离线校验配置、Manifest 语义、危险 cleanup、源码新鲜度和 JSON seed。
- `dsk plan`：只读获取本地 Directus 状态，分类 create、update、unchanged、conflict 和 dangerous。
- `dsk apply`：全量预检后按依赖顺序执行安全 create/update，默认阻断 conflict/dangerous。
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
```

`build` 会执行可信的项目 TypeScript 源码；后续 `plan/apply` 执行层只允许消费 `.dsk/generated/manifest.json`。

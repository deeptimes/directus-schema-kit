# Directus Schema Kit (DSK)

Directus Schema Kit 是面向 Directus 本地开发项目的声明式 Schema Provisioning 工具。TypeScript DSL 负责人工编写，版本化 JSON Manifest 负责校验、规划和执行边界。

CLI 接受 Directus 11.x 与 12.x。Node.js 22+ 下已验证 Directus 11.17.4、12.5.1 + SQLite 的自动集成生命周期；v12 自定义权限依赖相应 license 能力，完整 Studio 编辑回归仍待验证，详见 [兼容性](docs/compatibility.md)。

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
- `dsk clean`：清空全部自定义集合记录，保留结构和权限配置。
- `dsk reset`：完整清理开发业务环境，包括旧集合、业务权限、普通用户和上传文件；保留管理员、settings、License 配置。
- `dsk clear`：兼容旧版，仅清理代码声明的自定义 Schema。
- `--cwd`、`--config`、`--format json` 与稳定错误退出码。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## 项目内使用

在已有 Directus 项目中安装并执行：

```bash
pnpm add -D @deeptimes/directus-schema-kit
pnpm dsk init
pnpm dsk doctor
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk seed --dry-run
pnpm dsk seed --plan
pnpm dsk seed
pnpm dsk resources apply --dry-run
pnpm dsk clean --dry-run
pnpm dsk reset --dry-run
```

Directus 项目的 `.env` 或 shell 需提供 `PUBLIC_URL` 和具备管理权限的 `ADMIN_TOKEN`。DSK 仅连接本地／私网开发实例，不用于生产发布。`clean`／`reset` 先展示完整计划，真实执行需交互确认或显式 `--confirm`。初始管理员的识别和文件引用保护规则见 [清理命令](docs/cli-reference.md#开发环境清理)。

`build` 会执行可信的项目 TypeScript 源码；后续 `plan/apply` 执行层只允许消费 `dsk/generated/manifest.json`。

开发文档见 [文档首页](docs/README.md)：[Roadmap](docs/roadmap.md)、[配合 Directus 开发](docs/directus-development.md)、[开发规则](docs/development-rules.md) 和 [DSK 实现与验收](docs/development.md)。命令与格式细节见 [CLI 参考](docs/cli-reference.md)、[Schema DSL](docs/schema-dsl.md)、[Manifest V1](docs/manifest.md) 和 [兼容性](docs/compatibility.md)。

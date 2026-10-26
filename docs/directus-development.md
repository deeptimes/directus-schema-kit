# 配合 Directus 开发

DSK 是 Directus 项目的本地开发配套 CLI。Directus 负责运行服务、数据 API、权限执行和 Data Studio；DSK 通过 Directus API 管理声明的 Schema、基础数据与部分系统资源。

## 文件与职责

在已有 Directus 项目中安装并执行 `pnpm dsk init`。初始化不会覆盖已有文件，非 Directus 项目会被拒绝。安装与基础命令见 [README](../README.md)。

```text
dsk/
  config.json              # 路径与工具配置
  schemas/*.ts             # 业务 collection、field、relation
  resources/*.ts           # 权限、目录、Preset 等系统资源
  seeds/**/*.json          # 本地基础数据
  generated/manifest.json  # build 产物，禁止手改
docs/directus-schema-kit.md # init 为业务项目生成的 AI 规则
```

初始化规则统一生成到 `docs/directus-schema-kit.md`，包含 Directus 11 / 12 的兼容与安全约束。`init` 不覆盖已有文档；旧项目重新执行时会补建新路径，但保留原 `.ai/directus-schema-kit.md`，请审阅并合并项目定制内容后再自行清理旧文件。

| 内容 | 维护位置与方式 |
| --- | --- |
| 声明管理的数据模型、界面 Meta 和资源 | 修改 `dsk/` 源码后 build、plan、apply |
| 业务内容、编辑体验和权限效果 | 在 Data Studio / API 中创建、编辑并验证 |
| Directus 服务、数据库、环境变量和扩展代码 | 由 Directus 项目自身维护 |
| 类型迁移、重命名、存量数据转换和跨环境发布 | 超出 DSK 当前范围，需独立方案 |

可以在 Data Studio 探索模型和界面配置，但需要保留的声明应回写 DSL。DSK 不自动从实例反向生成源码；仅在 Studio 修改已声明属性，会在后续 plan 中产生差异。未声明资源不会自动被删除。

## 本地连接

Directus 项目的 `.env` 或 shell 提供 `PUBLIC_URL`、`ADMIN_TOKEN`；token 需要具备所操作资源的管理权限。使用 `pnpm dsk doctor` 检查项目、版本和配置。

只连接 localhost、RFC1918 私网或 `.local` 地址；私网地址本身不代表实例可安全清空，执行前仍须核对目标 URL。SQLite 项目应正确设置 `DB_CLIENT=sqlite3`，以启用对应的 decimal 表示归一化。

## 日常 Schema 变更

1. 阅读 [开发规则](./development-rules.md) 和现有定义，按业务域修改 `schemas/`；具体 API 见 [Schema DSL](./schema-dsl.md)。
2. 构建并离线校验，再查看目标实例差异：

```bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
```

3. 检查完整 Plan。若出现 conflict/dangerous，先解决冲突或制定独立迁移方案；普通 apply 会阻断全部写入。
4. 确认目标与范围后执行 `pnpm dsk apply`，再次 `pnpm dsk plan`，结果应无可执行差异。
5. 在 Data Studio 验证关系选择、文件上传、排序、审计字段和实际编辑体验。API 执行成功不能代替界面验收。

所有 Schema 文件组成同一个全局 Manifest，不能按文件局部 apply/clear。修改源码后必须重新 build；执行层会拒绝过期 Manifest。

## 基础数据与系统资源

先建立 Schema，再处理依赖这些 collection 的资源和基础数据。若 seed 依赖 folder 等系统资源，应先同步对应资源。

- 系统资源：`pnpm dsk resources apply --dry-run` 查看计划，再执行 `pnpm dsk resources apply`。
- 基础数据：`pnpm dsk seed --dry-run` 只做离线结构校验；`pnpm dsk seed --plan` 查看实例差异，再执行 `pnpm dsk seed`。
- 自定义资源之间使用稳定 `key` 和 `ref()` 关联；Directus 11 / 12 权限链为 roles → policies → access → permissions。
- v12 自定义过滤、字段限制、validation 和 presets 需要启用 `custom_permission_rules_enabled`；未启用时连 dry-run 也会在写入前报配置错误，详见 [兼容性](./compatibility.md)。
- Public permission 使用 `systemRef('policies.public')` 关联内置 policy，不创建副本、不硬编码 UUID。
- Seed 使用自然键 upsert 和稳定业务键引用；重复执行应收敛为 unchanged，不保存凭证或真实隐私数据。

## 重建、失败与审查

`pnpm dsk clear --dry-run` 展示完整 Manifest 声明的自定义 Schema 清理范围。仅在一次性本地实例或初期建模时使用真实 clear：交互执行默认拒绝，非交互必须显式 `--confirm`。它会删除相关结构和数据，也会清除其他自定义集合指向目标集合的关系字段；必须审查完整计划。它永远保护 `directus_*`，不支持局部清理。

Apply 串行写入，失败后停止，不提供事务回滚。根据 completed、failed、notExecuted 核对实例后重新 plan，不能假设失败意味着全部未写入。

提交审查时检查 DSL、seed、资源和生成的 Manifest 是否一致；CI 可运行 `pnpm dsk build --check` 和 `pnpm dsk --format json validate`。连接凭证只放本地环境配置，不进入版本控制。

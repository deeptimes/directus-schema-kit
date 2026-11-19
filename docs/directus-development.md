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
| 类型迁移、重命名和存量数据转换 | 超出 DSK 当前范围，需独立方案 |
| 测试 / 预发布 / 生产环境发布与实例间同步 | 由 Directus 官方 Environment Sync（`d6s`）承担，DSK 只保证本地开发实例；分工见[环境与发布](#环境与发布) |

可以在 Data Studio 探索模型和界面配置，但需要保留的声明应回写 DSL。DSK 不自动从实例反向生成源码；仅在 Studio 修改已声明属性，会在后续 plan 中产生差异。未声明资源不会自动被删除。

## 本地连接

Directus 项目的 `.env` 或 shell 提供 `PUBLIC_URL`、`ADMIN_TOKEN`；token 需要具备所操作资源的管理权限。使用 `pnpm dsk doctor` 检查项目、版本和配置。

只连接 localhost、RFC1918 私网或 `.local` 地址；私网地址本身不代表实例可安全清空，执行前仍须核对目标 URL。SQLite 项目应正确设置 `DB_CLIENT=sqlite3`，以启用对应的 decimal 表示归一化。

## 环境与发布

DSK 的定位是**本地开发工具**，架构边界和资源分层见 [架构](./architecture.md)。本地开发库是 Schema 和系统配置资源的 source of truth；DSK 只负责把 `dsk/` 声明应用到本地开发实例，不连接、也不写入测试 / 预发布 / 生产环境。跨环境发布由 **Directus 官方 Environment Sync**（`@directus/cli@12`，命令 `directus-cli` / `d6s`）承担；不要通过修改 `PUBLIC_URL` 把 DSK 指向生产地址。

当前 `PUBLIC_URL` 校验只识别 localhost、RFC1918 私网和 `.local`，不区分开发与生产；一台位于私网的生产实例在技术上仍可被连上。因此“不写生产”是流程约束，不是代码保证，发布配置必须确保该地址永远不指向生产。

### 为什么不能只用 schema snapshot

Directus 官方 `schema snapshot` / `schema apply` 只处理 Schema（`collections`、`fields`、`relations`、`systemFields`），不包含 roles、policies、access、permissions、presets、translations、settings、flows、dashboards、folders 等配置资源。只走 schema 通道会出现“**集合正常、权限缺失**”：表、字段、关系全部正确，schema 对比也没有差异，但角色没有对应的读取权限，前端请求会拿到 Directus 的 403，页面表现为“加载失败”。这类缺失无法从 schema 差异中发现。

### 官方 Environment Sync（d6s）

d6s 同时处理 Schema 和 Configuration，要求两端 Directus >= 12.2.0（本项目按 12.3+ 基线使用），版本（含 patch）与数据库 vendor 完全一致，并使用两端 admin token。它提供 `pull` / `diff` / `push`，默认 `merge` 只新增和更新，`mirror` 删除需要显式确认；Schema 先应用，Configuration 后在服务端事务中导入，两者不是同一个事务。它使用自己的 sync files 和 `id_map.json`，不读取 DSK 的 `manifest.json`。

版本与资料：截至 2026-11-20，`@directus/cli` latest 为 12.5.1（2026-11-18 发布），没有 beta dist-tag，属于官方正式发布，但工具较新；固定 CLI 版本（建议 12.5.1），并确保两端服务器版本完全一致，先在 staging 验证。官方文档见 [Environment Sync 概览](https://directus.com/docs/guides/environment-sync)、[Reference](https://directus.com/docs/guides/environment-sync/reference) 和 [How It Works](https://directus.com/docs/guides/environment-sync/how-it-works)；npm 包见 [@directus/cli](https://www.npmjs.com/package/@directus/cli)。

### 资源选择

d6s 支持按资源类型选择，不必全量同步：

```bash
# 只同步权限链（roles + policies + access + permissions），不动 Schema
d6s sync pull --from dev --no-schema --roles

# Schema 也同步，但只选指定集合 + 权限链
d6s sync pull --from dev --collections pages,posts --roles

# 从默认集合排除 flows / operations（folders 仍会同步）
d6s sync pull --from dev --no-flows

# 同时排除 flows / operations / folders
d6s sync pull --from dev --no-flows --no-folders

# 只同步 settings
d6s sync pull --from dev --no-schema --settings
```

- `--roles` 会带入 `policies`、`access`、`permissions`，是同步权限链的推荐入口；不要单独选 `--policies` 推送到全新目标，因为 access 记录引用 roles。
- 排除也要处理依赖：`--no-policies` 必须同时 `--no-roles`；`--no-folders` 必须同时 `--no-flows`。
- 资源选择不会缩小 Schema；Schema 用 `--collections` / `--exclude-collections` 控制，只同步配置时用 `--no-schema`。
- 也可以在 `directus.config.json` 的 project 里用 `resources` / `excludeResources` 固定范围，命令行 flags 覆盖项目配置。
- 可选资源：roles、policies、flows、dashboards、settings、folders、presets、users、translations；access、permissions、operations、panels 作为依赖自动带入。
- 推荐起步范围：`resources: ["roles", "folders", "presets", "translations"]`，先排除 flows、dashboards、settings、users；需要时再逐项加入。`roles` 已包含 policies / access / permissions。

### 发布流程

DSK 负责本地作者层和 dev 实例，d6s 负责跨环境。先为各环境执行 `d6s profile add`，发布方向固定为 **dev → staging → production**：

```bash
# 1. 把 dsk/ 声明应用到 dev
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk resources apply --dry-run
pnpm dsk resources apply
# 2. 从 dev 生成发布文件
d6s sync pull --from dev
# 3. 审查并提交 sync files + id_map.json
git diff directus/
git add directus/ && git commit
# 4. 先 diff 再 push
d6s sync diff --to staging
d6s sync push --to staging
d6s sync diff --to production
d6s sync push --to production
```

说明：

- `d6s sync pull --from production` 只用于首次接入时查看生产现状，不应作为常规发布步骤；否则发布文件会被生产旧状态覆盖，dev 的新资源无法上线。
- 首次接入生产已有配置时，建议用独立的 project 目录或分支保存生产基线，人工对比并解决差异后，再把 source 切回 dev。`id_map.json` 要提交，保证重复 push 更新同一条目标记录而不是重复创建。
- `d6s pull` 默认会带上比 DSK 资源更广的配置。正式项目应在 `directus.config.json` 的 project 里固定 `resources` / `excludeResources`，或在命令中显式传 `--roles` / `--no-flows` 等；不要依赖默认全量。Schema 用 `--collections` / `--exclude-collections` 单独控制；选择粒度是资源类型，不是单条记录，`roles` / `policies` 会带入依赖的 access / permissions。
- 常规发布只用 `merge`；`mirror` 只在明确需要删除目标记录并完成审查后使用。不要用 `--allow-drift` 绕过版本/vendor 不一致，应该先对齐环境。
- 发布前重点审查 `admin_access`、settings、flow 端点、user 维度的 access/preset；d6s 默认不同步用户，也不应把用户个人授权当作跨环境声明。
- Schema 与 Configuration 不是原子事务。若 Schema 已应用而 Configuration 失败，按 d6s 提示重新 `diff` 后再次 `push`，不要手工猜测状态。

### 职责边界

- DSK：`dsk/` 源码 → 本地 dev 实例；负责 Schema、资源声明的作者层和本地幂等应用。
- d6s：从 dev 生成 sync files → 应用到测试 / 预发布 / 生产；负责跨环境 ID 映射、diff、merge/mirror 和发布审查。
- `manifest.json` 是 DSK 自身的执行输入；d6s 不消费它，不要把它描述成 d6s 的契约。
- 业务内容、seed、文件和用户账号不属于 Schema/Configuration 同步范围；业务内容各环境自管，需要跨环境一致的初始 / 参考数据从 dev 起始，由独立流程交付。
- 资源分层、客户改角色名、用户授权等边界见 [架构](./architecture.md#6-资源分类) 和 [命名、稳定键与客户改动](./architecture.md#9-命名稳定键与客户改动)。

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


开发过程中，`pnpm dsk clean --dry-run` 预览清空业务记录，`pnpm dsk reset --dry-run` 预览完整清理。两者覆盖实例全部自定义集合，包括代码中已移除的旧集合；reset 还清理普通用户、业务权限、上传文件和文件夹，保留管理员、settings 和 License 配置。执行确认、初始管理员识别和保留资源引用冲突见 [CLI 清理命令](./cli-reference.md#开发环境清理)。

# 架构

本文定义 DSK 的定位、分层、状态流、资源分类和跨环境边界。产品范围见 [Roadmap](../maintainer/roadmap.md)；日常操作见 [配合 Directus 开发](./directus-development.md)；实现约束见 [开发规则](./development-rules.md) 和 [DSK 实现与验收](../maintainer/development.md)。

## 1. 为什么需要 DSK

DSK 不是单纯的 Schema 生成器，也不是部署工具。它先解决 Directus 项目里的四个核心问题；跨环境同步是随后的第二层问题：

| 使用方诉求 | 具体问题 | DSK 的响应 |
| --- | --- | --- |
| 可复现 | 在 Studio 里点出来的 collection、字段、meta 无法版本化；清空后要重新点一遍 | 用固定 TypeScript DSL 声明模型；`build` 生成确定性 Manifest；`apply` 可重复执行 |
| 人机协作 | AI 可以改数据库，人只能点 Studio；双方不清楚对方做了什么 | 人和 AI 共用 `dsk/` 声明面；`plan` 显示实例与声明的差异；执行层只消费 Manifest |
| 标准化 | 每个新项目用不同方式搭后端，约束不一致 | `init` 统一工作区；严格 DSL、离线校验、风险分级和安全规则作为底座 |
| 快速重建 | 个人开发没时间反复修环境；需要清空后快速回到完成态 | `clean` / `reset` 清理本地实例；`resources apply` + `seed` 重建资源和基础数据 |
| 跨环境 | 本地完成后要交付到测试 / 生产，但资源不能靠 snapshot 同步 | 跨环境交给官方 `d6s`；DSK 只保证本地，不碰生产 |

一句话：**DSK 把“本地开发实例里点出来的状态”变成可审查、可重复、可重建的声明式状态。**

DSK 的核心不是“同步”，而是“本地状态的可复现”。跨环境同步是第二层问题；不能用生产同步的需求反过来破坏本地作者层的确定性。

## 2. 定位

DSK 是 **local-first 的声明式 provisioning 工具**。

它是：

- **作者界面**：人和 AI 都通过 `dsk/` 下的 TypeScript DSL 和 JSON Seed 表达意图。
- **本地执行器**：把声明应用到本地 Directus 实例，负责 plan、apply、resources、seed 和清理。
- **可复现 / 恢复工具**：清空本地环境后，用代码和 Seed 快速回到已知状态。
- **标准化底座**：作为可复用的 `devDependency` 安装到任意 Directus 项目，`init` 生成统一工作区和 AI 规则；严格 DSL、校验、安全规则和 CLI 契约保持一致。

它不是：

- 生产部署工具；生产发布由官方 Environment Sync（`d6s`）承担。
- 业务内容同步工具；d6s 当前也不同步业务内容。
- 数据库反向工程工具；DSK 不把实例状态静默写回源码。
- 通用数据库迁移工具；不负责重命名、类型变更和存量数据转换。
- Web 管理后台；所有操作通过 CLI 和版本化文件完成。

## 3. 核心概念

| 概念 | 含义 |
| --- | --- |
| `dsk/` 工作区 | 版本化的作者面：`config.json`、`schemas/`、`resources/`、`seeds/`、`generated/manifest.json` |
| 声明 | 人 / AI 编写的 TypeScript Schema、资源定义和 JSON Seed |
| Manifest | `build` 的确定性产物；执行层唯一的输入契约；禁止手改 |
| 本地开发实例 | DSK 唯一连接和写入的 Directus 实例，通常是 localhost 或私网开发库 |
| 资源 | 除 Schema 外的系统配置对象：settings、folders、roles、policies、access、permissions、presets、translations |
| 稳定业务键 | DSK 在实例中认领资源时使用的字段，例如 role / policy 的 `name`、permission 的 `policy + collection + action` |
| 漂移（drift） | 实例状态与声明不一致；由 `plan` 或 `d6s diff` 暴露，不自动回写源码 |
| 发布文件 | d6s 生成的 `schema/`、`data/` 和 `id_map.json`，提交到 git 后再 push 到目标环境 |
| 环境本地 | 允许在不同环境有差异的配置，例如 settings、URL、客户展示名、用户数据 |

## 4. 分层架构

```text
┌──────────────────────────────────────────────────────────────┐
│ 作者层（人和 AI 共用）                                        │
│ dsk/schemas/*.ts   dsk/resources/*.ts   dsk/seeds/**/*.json  │
└───────────────────────────┬──────────────────────────────────┘
                            │ dsk build
┌───────────────────────────▼──────────────────────────────────┐
│ 构建 / 校验层                                                 │
│ jiti 执行 → blueprint 展开 → 确定性排序 → manifest + 源码摘要 │
│ validate：结构、引用、重复定义、关系完整性、Manifest 新鲜度   │
└───────────────────────────┬──────────────────────────────────┘
                            │ manifest.json（唯一执行输入）
┌───────────────────────────▼──────────────────────────────────┐
│ 本地执行层                                                    │
│ plan / apply / resources apply / seed / clean / reset / clear │
│ 全量预检、风险分级、依赖排序、最小 PATCH、失败停止            │
└───────────────────────────┬──────────────────────────────────┘
                            │ Directus REST（仅本地 / 私网）
┌───────────────────────────▼──────────────────────────────────┐
│ 本地 Directus 开发实例                                        │
└───────────────────────────┬──────────────────────────────────┘
                            │ d6s pull（DSK 边界之外）
┌───────────────────────────▼──────────────────────────────────┐
│ 发布层（Directus 官方 Environment Sync）                      │
│ sync files + id_map.json → staging → production               │
└──────────────────────────────────────────────────────────────┘
```

各层职责：

- **作者层**只表达意图，不直接连接实例。人和 AI 的改动都通过 git diff 可见。
- **构建 / 校验层**把声明编译成扁平、确定性的 Manifest，并拒绝重复、缺失引用、过期产物。
- **本地执行层**把 Manifest 与本地实例比较，先 plan 再 apply；不把实例状态反推成源码。
- **本地实例**是验证场，不是跨环境的事实来源；跨环境的事实来源是“已经 apply 过的 dev 状态”。
- **发布层**由 d6s 独立完成；DSK 不参与目标环境的写入。

## 5. 状态模型

DSK 相关状态如下，且它们不能自动互相回写：

| 状态 | 载体 | 产生方式 | 用途 |
| --- | --- | --- | --- |
| 期望状态 | `dsk/` | 人 / AI 编辑，git 审查 | 唯一作者面 |
| 构建状态 | `generated/manifest.json` | `dsk build` | 执行层唯一输入 |
| 本地实际状态 | 本地 Directus 数据库 | `apply` / `resources apply` / `seed` | 验证、预览、Studio 探索 |
| 发布状态 | d6s `sync files` + `id_map.json` | 从已应用的 dev 实例 `pull` | 跨环境发布 |
| 目标环境状态 | staging / production 数据库 | d6s `push` + 环境本地配置 | 运行 |

关键规则：

- `dsk/` → Manifest → 本地实例，是单向执行链。
- 直接改 Studio 造成的差异会在下一次 `plan` 中出现；DSK 不会自动把它写回 `dsk/`。
- d6s `pull` 只把 dev 实例的配置写入发布文件，不会写入 `dsk/`。
- 目标环境被人工修改后，d6s `diff` 会显示差异；这是 drift，不是自动合并。需要人工决定回写 `dsk/`，还是用发布状态覆盖目标。

### 人机协作约定

DSK 不能物理阻止 AI 直接操作数据库；它提供的是可审计的默认路径。约定是：

- 人和 AI 都通过 `dsk/` 表达改动，改动进入 git diff。
- AI 执行 `build` / `validate` / `plan` / `apply`，并把 Plan 作为审查面；不绕过 Manifest 直接写实例。
- 人在 Studio 探索模型和界面后，需要保留的改动回写 `dsk/`；不回写的改动会在下一次 `plan` 中显示为 drift。
- 绕过 DSK 的 API / SQL 修改不会自动进入 `dsk/`，因此不能成为跨环境交付的一部分。

### 变更发起权

这条治理原则贯穿项目早期、中期和后期：

- **Schema 和 DSK 管理的系统配置**（settings、folders、roles、policies、access、permissions、presets、translations）：变更应从 `dsk/` 发起，先应用到本地 dev，再由 d6s 发布到目标环境。
- **Studio** 用于探索模型、验证编辑体验和编辑业务内容。任何需要长期保留的 Schema / 系统配置修改，必须回写 `dsk/`；Studio 不是受管配置的 source of truth。
- **DSK 不直接写生产**；“由 DSK 发起”指的是作者层和 dev 实例，生产执行仍由 d6s 完成。
- **业务内容、文件、用户**各环境自管，不属于 DSK / d6s 的系统配置同步范围。
- **DSK 尚未管理的系统配置**（如 flows、dashboards、部分 settings）必须明确 owner：由 Studio 维护、由 d6s 同步，或后续纳入 DSK；不能默认 DSK 会处理。
- **紧急生产修改**只能作为明确例外：记录原因、尽快回写 `dsk/`，否则下一次发布会出现 drift 或被覆盖。
- `clean` / `reset` 只用于一次性 dev 实例；它们不是生产回滚或备份工具。代码层用 `safety.environment` + allowlist 收紧目标，但私网生产如果被显式加入 allowlist 仍可能连接，因此仍需流程审查。

v3.0 的实际识别边界见 [配合 Directus 开发](./directus-development.md) 的“Studio 修改与 DSK 的识别边界（v3.0）”一节。

## 6. 资源分类

只用“系统资源 / 用户资源”二分容易和 `directus_users`、业务 collection 混淆。建议按以下五类整理，其中“环境本地”是横切的同步属性：

| 分类 | 典型内容 | 期望状态来源 | DSK 当前能力 | 跨环境同步 | 允许环境差异 |
| --- | --- | --- | --- | --- | --- |
| **Schema** | collections、fields、relations、groups | `dsk/schemas/` | `build` / `plan` / `apply` | d6s Schema | 不允许 |
| **系统配置资源** | settings、folders、roles、policies、access、permissions、presets、translations | `dsk/resources/` | `resources apply` | d6s Configuration | 不允许（名称、授权链和 settings 白名单是契约） |
| **业务内容** | 自定义集合的 items、上传文件 | Directus / Studio；Seed 只做本地 bootstrap | `seed`（仅本地） | 当前不同步 | 允许 |
| **用户数据** | `directus_users`、用户个人 access / preset | 各环境自行维护 | 不管理 | 默认不同步；d6s 用户为 opt-in，源端 user grant 会从同步范围中丢弃，目标端已有授权不会被 mirror 删除 | 允许 |
| **环境本地配置** | settings 白名单外的字段、URL、License、邮件、客户展示文案 / 覆盖 | 各环境自行维护 | settings 仅声明受控 scalar 字段 | 按需排除或逐项 review | 允许 |

说明：

- 你说的“系统资源”对应前两层：Schema 和系统配置资源；“用户资源”更接近业务内容和用户数据。
- “环境本地配置”不是独立对象类型，而是一种**同步属性**：同一个对象或字段允许在不同环境有差异。
- DSK 当前声明 8 类系统配置资源，其中 settings 只覆盖受控 scalar 白名单；flows、operations、dashboards、panels 属于系统配置，但 DSK 尚未提供声明入口。d6s 可以同步它们，但需要先在 dev 维护并纳入 review，或等 DSK 扩展。
- `reset` 保留 `directus_settings`、管理员和 License；settings 的受控 scalar 字段已可通过 DSK 重建，License、AI、存储、邮件和品牌图片仍不在声明范围。

## 7. 快速重建回路

这是 DSK 最核心的本地工作循环，也是“清空后快速回到完成态”的实现：

```text
dsk reset（清理本地业务环境，保留管理员 / settings / License）
  → dsk apply（重建 Schema）
  → dsk resources apply（重建角色、策略、权限、书签、文件夹、翻译）
  → dsk seed（重建基础数据）
  → Studio / API 验收
```

约束：

- 顺序不能反：Schema 必须先于依赖它的 permissions、presets 和 seed。
- `clean` 只清业务记录，保留结构和资源，适合只重置内容。
- `reset` 会删除自定义 Schema、业务资源、普通用户、上传文件和文件夹；执行前必须审查完整计划。
- 重建依赖 `dsk/` 和 Seed 的完整性；如果某个手工配置没有回写 DSK，reset 后就会丢失。这正是 DSK 要解决的问题。

## 8. 跨环境同步架构

### 8.1 边界

- DSK 只写本地实例，不连接 staging / production。
- 连接层已强制 `safety.environment=development` 和 host allowlist：默认 loopback、`10.0.0.0/8`、`192.168.0.0/16`、`.local`；`172.16.0.0/12` 与公网默认拒绝，其他私网地址需在 `safety.allowedHosts` 显式加入。私网生产实例仍可能被显式加入，因此“不写生产”仍是流程约束加配置审查，而不是靠地址猜测。
- 不在目标主机上执行普通的 `dsk resources apply` 作为发布手段。那会让 DSK 进入生产写路径，也会绕过发布审查。
- 跨环境发布由官方 d6s 负责；DSK 不替代 d6s，也不替代官方备份 / 恢复能力。

### 8.2 发布链路

```text
dsk/ 源码
  → dsk build / validate / plan / apply / resources apply
  → 本地 dev 实例（已应用状态）
  → d6s sync pull --from dev
  → sync files + id_map.json（提交 git，review）
  → d6s sync diff / push
  → staging
  → production
```

发布方向固定为 **dev → staging → production**。发布源已确认是**本地 dev 实例**，由发布执行人在本机运行 d6s；`d6s sync pull --from production` 只用于首次接入时查看生产现状，不应作为常规发布步骤，否则发布文件会被生产旧状态覆盖，dev 的新资源无法上线。未来多人协作时，需要指定固定的 release operator 或共享 dev，避免从不同人的本地状态 pull。

首次接入已有生产配置时：

- 用独立的 project 目录或分支保存生产基线，人工对比并解决差异后，再把 source 切回 dev。
- `id_map.json` 必须提交，保证重复 push 更新同一条目标记录，而不是重复创建。
- 首次 push 遇到同名 / 多条匹配时，d6s 会要求人工选择；不要让工具猜。

### 8.3 d6s 的约束

- 官方最低 Directus 12.2.0；本项目按 12.3+ 基线使用。两端版本（含 patch）和数据库 vendor 必须完全一致。
- 需要两端 admin token。
- 默认 `merge` 只新增和更新；`mirror` 删除需要显式确认。
- Schema 先应用，Configuration 后在服务端事务中导入；两者不是同一个事务，失败后要重新 `diff` 再 `push`。
- 资源范围是显式能力：`--<resource>` 只选某类，`--no-<resource>` 从默认集合排除；也可以在 `directus.config.json` 的 project 里用 `resources` / `excludeResources` 固定。可选资源是 roles、policies、flows、dashboards、settings、folders、presets、users、translations；access、permissions、operations、panels 作为依赖自动带入。选择粒度是资源类型，不是单条记录。
- `--roles` 会带入 policies、access、permissions，是同步权限链的推荐入口；不要单独用 `--policies` 推送到全新目标，因为 access 记录引用 roles，可能失败。
- 排除时要处理依赖：`--no-policies` 必须同时 `--no-roles`；`--no-folders` 必须同时 `--no-flows`。否则 d6s 会拒绝，或把依赖重新拉回来。
- 资源选择不缩小 Schema；Schema 用 `--collections` / `--exclude-collections` 单独控制。只同步配置时用 `--no-schema`。
- 默认不同步 users；users 不在范围内时，源端 user 维度的 access grant 会从同步范围中丢弃，目标端已有授权不会被 mirror 删除。
- 不要用 `--allow-drift` 绕过版本 / vendor 不一致；应先对齐环境。
- 版本与稳定性：截至 2026-11-20，`@directus/cli` latest 为 12.5.1（2026-11-18 发布），没有 beta dist-tag，属于官方正式发布，但工具仍然很新。固定 CLI 版本（建议 12.5.1），并确保两端服务器版本完全一致；先在 staging 验证。官方参考：<https://directus.com/docs/guides/environment-sync/reference>。

### 8.4 内容与数据

| 数据类型 | 是否跨环境同步 | 当前方式 |
| --- | --- | --- |
| Schema | 是 | d6s Schema；不可用时才退回官方 snapshot |
| 系统配置资源 | 是 | d6s Configuration |
| 业务内容 | 否 | 独立方案；当前 d6s 不同步内容 |
| 上传文件 | 否 | 独立存储 / 迁移方案；d6s 不同步文件内容 |
| 用户数据 | 默认否 | d6s users 为 opt-in；不建议作为常规发布路径 |
| Seed 基础数据 | 否 | DSK 本地 bootstrap；生产初始化需独立受控流程 |

业务内容各环境自管，不需要从 dev 同步；如果某类初始 / 参考数据必须跨环境一致（字典、分类、必要的基础记录），它应当从 dev 起始，通过受控导出 / 导入或一次性初始化流程交付，而不是各环境各自维护。DSK Seed 只负责本地 bootstrap，d6s 不同步内容。

因此，“资源同步完成”不等于“两个环境等价”。业务内容、文件、用户和 settings 仍需要单独确认。

## 9. 命名、稳定键与客户改动

这是跨环境最容易出问题的地方。

DSK 在本地认领资源时使用稳定业务键：

- roles / policies：`name`
- access：`role + policy + user`
- permissions：`policy + collection + action`
- folders：`name + parent`
- presets：`bookmark + collection + role + user`
- translations：`key + language`

d6s 使用 `id_map` 记录源 / 目标记录的对应关系；同一条逻辑记录的字段以源为准，**不提供字段级环境差异**。因此，同一条记录在不同环境保留不同的 `name` 不是 d6s 的能力。

落到规则上：

- **被同步的角色 / 策略名称是契约，不是客户可自由改写的展示文案。**
- 客户看到的“高级会员 / 优质会员”这类差异，应放在应用层解决：前端根据角色标识映射展示文案，而不是改 Directus 的 role / policy `name`。
- 如果只是首次接入时名称不同：可以在首次 push 时人工把源记录映射到目标记录并写入 `id_map`，避免重复创建；但后续 push 仍以源 `name` 为准，目标名称会收敛到 dev。
- 如果客户已经在生产改了 `name`：
  - `d6s diff` 会显示差异；
  - 从 dev push 会把 `name` 改回 dev 的值；
  - 从 prod pull 会把客户的 `name` 写进发布文件，污染源状态。
  这是 drift，不是自动映射。
- 如果确实必须 per-env `name`，只能把该资源从 d6s 同步范围中排除，作为“环境本地配置”单独管理；这等于放弃这条资源的统一配置，需要明确记录例外。
- 不建议依赖“同名不同义”或“跨环境复用同一个 UUID”来绕过：前者会让 DSK 误认领，后者把环境 UUID 硬编码进声明。

已确认采用**名称契约**：roles / policies 的 `name` 不在各环境自由改写；客户展示名由应用层映射。若未来客户必须使用不同名称，则把该资源标记为环境本地并从 d6s 排除，作为明确例外。

同样的稳定键语义适用于 folders、presets 和 translations：folder 的 `name + parent + type`、preset 的 `bookmark + collection + role + user`、translation 的 `key + language` 都是身份。**在 Studio 改名会被 DSK 视为“旧资源消失 + 新资源创建”，不会原地 update，旧资源也不会自动删除。** 需要改名时应按显式迁移处理：修改声明、规划新资源、手动或显式删除旧资源，并检查引用；不要把 Studio 改名当作普通编辑。

### 受管资源状态（v3.1 设计）

当前 DSK 没有资源所有权状态，只能按业务键匹配；因此无法区分“Studio 改名”和“新资源”。要实现“DSK 管理的内容被 Studio 改动时提示回 `dsk/` 处理”，需要一份本地受管资源状态：

- `dsk/.managed-state.json`（本地、gitignore，不进入 Manifest 或跨环境交付）记录 `projectId -> {dsk key -> Directus ID}`。
- 首次 apply 创建或认领资源时写入 ID；后续 dry-run 优先按 ID 找回记录，而不是只按名称匹配。
- ID 存在但业务键（name / bookmark / translation key）变化：标为 `drift` 并阻断该项，提示“在 `dsk/` 修改声明，或在 Studio 恢复原名”，不自动 rename、不创建副本。
- ID 存在但记录被 Studio 删除：标为 `missing-managed`，提示重建或移除声明。
- 未登记的资源：作为 `unmanaged` 信息列出，不自动删除；文件库中用户自建 folder 可能很多，默认只做提示。
- 状态按 Directus `project_id` 而不是 URL 区分，dev 地址变化时仍能保持映射。
- d6s 继续使用自己的 `id_map.json`；DSK 的本地状态不用于跨环境映射。
- 首版只覆盖 resources；Schema 的 collection / field 重命名仍属于独立迁移，不自动改名。

这项能力尚未实现；当前行为以本文前面的“改名 = 新资源”说明为准。

### 平台默认层（v3.1 设计）

除了项目自身的 `dsk/` 声明，DSK 还可以提供一套**随 DSK 发布维护的平台默认层**，用于新项目第一次初始化本地实例：

- `dsk init` 负责脚手架；新的 `dsk bootstrap`（或 `dsk defaults apply`）负责把默认层应用到本地 dev，仍走 `plan` / 审核 / `apply`，不连接生产。
- 默认层可以包含：
  - settings 受控字段：`project_name`、`default_language`、`default_appearance`、`default_theme_light/dark`、`custom_css`、`module_bar`、theme overrides；
  - global presets：包括 `directus_presets` 页面自身的表格布局；
  - 默认 translations；
  - 默认 folders；
  - 可选的基础 roles / policies / access / permissions（必须单独评审，默认不启用）。
- 不包含 License、secret、存储 / 邮件 / 品牌文件引用、用户、业务内容或危险 Schema 迁移。
- 优先级：项目 `dsk/` 声明覆盖平台默认层；同一 settings 字段以项目为准；同一 preset / translation 业务键以项目为准；personal preset 不被默认层覆盖。
- `dsk bootstrap` 必须幂等；`reset` 清除 presets / folders 后应重新运行 bootstrap 或 `resources apply`，而 settings / translations 会保留。
- 默认层随 DSK 版本发布；旧项目可以选择固定版本或显式同步，不自动改写已有项目声明。
- 生产是否使用同一 settings / preset 默认，由 d6s 的 project scope 决定；DSK 不直接写生产。

治理建议：

- 生产环境的 Studio admin 权限不交给客户；客户只拿业务内容的编辑角色。
- 系统配置的修改走 **dev → d6s → 目标环境**，不在生产直接改。
- 如果客户确实改了系统配置，先判断是回写 `dsk/` 还是用发布状态覆盖，不要让两边长期漂移。

## 10. 安全与边界

- `build` 会执行可信的项目 TypeScript 源码；执行层只消费 `manifest.json`，不执行 DSL。
- Manifest 不包含解析后的 secret；凭证只放本地环境配置，不进入版本控制。
- `plan` 是全量只读预检；出现 conflict / dangerous 时，普通 `apply` 阻断全部 Schema 写入。
- 资源删除必须显式 `delete: true` 并额外 `--confirm-destructive`；普通 apply 不删除未声明资源。
- `clean` / `reset` 只在一次性本地实例或初期建模使用；执行前展示完整计划，真实执行需交互确认或显式 `--confirm`。
- `reset` 保护 `directus_settings`、管理员、License 和 Public policy；自定义 Schema、业务资源、普通用户和上传文件会被清理。
- d6s 发布前必须 `diff`；`mirror`、`admin_access`、settings、flow 端点、user 维度授权都需要单独 review。
- 生产发布使用独立凭证和审批流程；DSK 的本地 `ADMIN_TOKEN` 不应指向生产。

### 生产保护（已实现）

已确认需要代码级硬性阻止，不能只靠文档约定。当前实现：

- `dsk/config.json` 的 `safety.environment` 只接受 `development`；缺失或出现其他值时所有在线命令拒绝。
- `safety.allowedHosts` 是显式附加 allowlist。默认允许 loopback、`10.0.0.0/8`、`192.168.0.0/16` 和 `.local`；**不默认允许 `172.16.0.0/12` 和公网地址**。dev 地址变化时在 `allowedHosts` 中显式加入（例如 `172.20.0.0/24`）；公网地址和过宽 CIDR 在配置校验阶段拒绝。
- `doctor` 展示解析出的 host、命中的 allowlist 规则和是否允许。
- `doctor`、`plan`、`apply`、`resources apply`、`seed`、`clean`、`reset` 统一经过 `directusConnection` 的目标校验；目标地址不能只靠 `.env` 静默切换。
- 生产发布只走 d6s；DSK 的本地 `ADMIN_TOKEN` 不进入生产。
- 当前状态：代码和单元测试已实现；v3 本地矩阵继续覆盖命令级行为。

## 11. 关键决策

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | DSK 是 local-first 工具，不写生产 | 避免本地与生产不一致；生产发布需要独立的安全边界和审批 |
| D2 | Manifest 是执行层唯一输入，禁止手改 | 保证 build / plan / apply 的确定性，防止执行层猜测旧格式 |
| D3 | 跨环境同步由官方 d6s 承担 | 官方同时覆盖 Schema 和 Configuration，避免自研同步器和第三方扩展 |
| D4 | 同步资源的 `name` 是契约 | 已确认：d6s 不支持字段级环境差异；客户展示名应在应用层映射 |
| D5 | 业务内容、文件、用户默认不同步 | 跨环境记录身份和文件引用需要独立架构；d6s 当前也不同步内容 |
| D6 | 资源按 Schema / 系统配置 / 业务内容 / 环境本地分层 | 避免“系统 / 用户”二分造成的语义混淆，明确每一层的同步责任 |
| D7 | 不硬编码环境 UUID；使用 `ref()` / `systemRef()` | 保持跨环境可移植，避免把本地 ID 写进声明 |
| D8 | 不做实例到源码的反向生成 | 防止 AI 或人工绕过 review 的 Studio 改动被静默接受 |
| D9 | DEV 固定为本地实例，发布从本地 dev 开始 | 已确认；避免从不同人的本地或目标环境 pull 造成源漂移 |
| D10 | d6s 资源范围显式选择 | 已确认；用 CLI flags 或 project config，不依赖默认全量 |
| D11 | 业务内容各环境自管，初始 / 参考数据从 dev 起始 | 已确认；d6s 不同步内容，Seed 只做本地 bootstrap |
| D12 | 增加代码级生产保护 | 已实现；`safety.environment=development` + host allowlist，默认阻止 `172.16.0.0/12` 与公网，可通过 `allowedHosts` 显式扩展 |
| D13 | 资源改名不自动迁移 | v3.0 按稳定键视为 create + 旧资源保留；改名按显式迁移处理，v3.1 再评估 `renameFrom` / 本地 ID 映射 |

## 12. 开放问题

- **默认同步范围**：起步建议 `roles`、`folders`、`presets`、`translations`（`roles` 已含 policies / access / permissions）；settings、flows、dashboards 的启用时机仍需逐项确认。
- **初始 / 参考数据的交付机制**：方向和来源已确认（从 dev 起始），但具体用 Directus 导出 / 导入、一次性脚本还是独立工具，仍需设计。
- **多人协作**：当前 DEV 是发布执行人的本地实例；如果未来多人开发，需要指定 release operator 或共享 dev。
- **用户维度授权**：user-scoped access / preset 是否明确禁止跨环境声明？如果需要，如何建立稳定用户键。
- **settings 字段集合**：v3.0 已实现受控 scalar 白名单；License / AI / 存储 / 邮件 / 品牌图片等字段始终排除，后续是否扩展需单独评审。
- **生产保护实现**：environment 标签和 host allowlist 的具体字段、默认值和迁移策略。
- **版本范围**：v3.0 认证基线是 Directus 12.7.0 + SQLite；其他版本如果需要支持，必须单独验证，不能把代码接受当作已认证。

## 13. 与现有文档的关系

- [Roadmap](../maintainer/roadmap.md)：产品范围和当前不做项。
- [配合 Directus 开发](./directus-development.md)：日常命令、工作流和环境发布操作。
- [开发规则](./development-rules.md)：Schema / DBML 命名、AI 编写约束和安全边界。
- [DSK 实现与验收](../maintainer/development.md)：模块职责、结果契约、测试和发布检查。
- [Manifest 格式 V1](./manifest.md)、[Schema DSL](./schema-dsl.md)、[CLI 参考](./cli-reference.md)、[兼容性](./compatibility.md)：具体格式和 API 细节。

本文是架构基线；操作细节与实现契约以对应文档为准。若产品需求与本文冲突，以 [Roadmap](../maintainer/roadmap.md) 为准并更新本文。

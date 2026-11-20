# Roadmap 与产品边界

本文替代原 PRD，作为当前产品需求与验收基线。后续方向不代表已实现能力，也不承诺发布日期。

## 当前交付（v3.0）

DSK 面向本地 Directus 项目，让数据模型和基础资源可以通过代码审查、离线校验和可重复初始化维护。它通过 Directus API 工作，不需要安装 Data Studio 扩展。

| 能力 | 当前交付 |
| --- | --- |
| 工作区 | `init` 幂等创建 `dsk/`；`doctor` 诊断项目与配置 |
| Schema | 严格 TypeScript DSL；八类关系 blueprint；Markdown、Tags、Code、Toggle helper |
| Manifest | 扁平、确定性 JSON，格式版本为 `manifestVersion: 1`，带源码 SHA-256 摘要；`build --check` 检查新鲜度 |
| 变更 | 离线 validate；只读 plan；全量预检后执行安全 create/update |
| 基础数据 | 版本化 JSON seed，自然键 upsert 和跨集合／同集合引用 |
| 系统资源 | settings、folders、roles、policies、access、permissions、presets、translations |
| 清理 | `clean` 清空全部自定义集合记录；`reset` 完整清理业务环境并保留管理员和基础配置；`clear` 保持仅清理声明 Schema 的兼容行为，真实删除必须确认 |
| 工程化 | 文本／版本化 JSON 输出、稳定退出码、凭证脱敏 |

当前认证基线：Node.js 22+、Directus **12.7.0** + SQLite。其他 Directus 版本或数据库需单独验证。`@directus/cli` **12.5.1** 仅用于跨环境发布，不是 Directus 服务器版本。

**`manifestVersion: 1` 的含义**：它是 `dsk/generated/manifest.json` 的**格式版本**，不是 DSK 产品版本，也不是 Directus 版本。它定义 build / plan / apply 之间的 JSON 契约；格式发生不兼容变化时才升级为 V2，并要求重新 build 和迁移。

## v3.0 已交付（3.0.0）

v3.0 的主题是 **Directus 系统模型资源全覆盖 + 逐项验收 + 本地安全硬边界**。v3.0 不把 DSK 变成生产部署工具；跨环境仍由官方 `d6s` 完成。

状态：v3.0 已合并到 `main`（merge commit `7c603cf`）。`package.json` 仍是 `2.3.0`；正式发版时再统一更新版本号和 changelog，避免把“合并”与“发布”混为一谈。

| 编号 | 目标 | 优先级 | 当前状态 | v3 完成条件 |
| --- | --- | --- | --- | --- |
| V3-1 | 生产写入硬保护 | P0 | 代码与单元测试已实现，待 v3 命令级矩阵 | `safety.environment` 只接受 `development`；`allowedHosts` 默认 loopback、`10.0.0.0/8`、`192.168.0.0/16`、`.local`，默认阻止 `172.16.0.0/12` 和公网；`doctor` 与所有写命令统一校验；覆盖测试 |
| V3-2 | Settings 系统配置 | P0 | 已实现，单元测试与 Directus 12.7.0 API 验证通过 | 受控 scalar settings 声明（如 project name、default language、color）；只更新声明字段；环境本地 / 敏感字段排除；`reset` 继续保留；本地 + d6s 测试 |
| V3-3 | Folders / 文件管理目录 | P0 | 已实现，单元测试与 12.7.0 API 验证通过 | 稳定键加入 `type`（files / flows）；`name + parent + type`；重命名、移动、删除、文件引用阻断；测试 |
| V3-4 | Presets / 书签 | P0 | 已实现，单元测试与 12.7.0 API 验证通过 | global / role / personal preset、tabular、bookmark、collection、role；personal preset 不跨环境；重复执行收敛；测试 |
| V3-5 | Translations | P0 | 已实现，单元测试与 12.7.0 API 验证通过 | 多语言、`key + language`、>100 分页、更新 / 删除 / 空文字 / Unicode；测试 |
| V3-6 | 权限链 roles / policies / access / permissions | P0 | 已实现，单元测试与 12.7.0 简单权限链验证通过 | 名称契约、id_map、admin_access 审查、user-scoped 排除、Public policy；跨环境无重复；测试 |
| V3-7 | d6s 发布契约 | P0 | release checklist 已定；scope / pull / diff / push / id_map / mirror / rename 跨环境矩阵通过 | CLI 版本 pin、project `resources` / `excludeResources`、`--roles` / `--no-*`、`id_map`、release checklist |
| V3-8 | v3 测试矩阵 | P0 | 大部分完成：本地 12.7.0 API smoke、license 自定义权限过滤、>100 翻译、SQLite 补丁、clean/reset、d6s 基础矩阵 / mirror 删除 / 版本阻断 / scope 依赖规则通过；Data Studio 自定义权限视觉回归由用户确认；incomplete pull、多 target id_map 仍待补 | playground 本地矩阵 + 双实例 d6s 矩阵；每类资源 create / update / unchanged / delete / conflict / drift |
| V3-9 | Manifest / 兼容性 | P1 | settings / folders / presets 校验已纳入 Manifest 格式 V1，暂不引入 V2 | 新资源类型是否需要升级格式版本；若需要提供迁移；否则明确 V1 扩展 |
| V3-10 | Flows / Operations / Dashboards / Panels | P1（v3.x） | 待独立设计 | 先明确生命周期、危险确认和失败恢复；v3.0 不纳入，v3.x 单独评审 |
| V3-11 | Users / 内容 / 文件数据同步 | 非目标 | 明确边界 | 各环境自管；需要时独立设计，不用 DSK / d6s 做内容同步 |
| V3-12 | 补全 Directus 12.x 认证 | P0 | 12.7.0 基础生命周期、简单权限链、license 自定义权限过滤 API 和 d6s 跨环境通过；Data Studio 自定义权限视觉回归待执行 | 有许可的自定义权限规则和 Data Studio 编辑回归完成 |

### v3 系统模型覆盖清单

| Directus 系统模型 | v3 处理 |
| --- | --- |
| collections / fields / relations | 保持现有 Schema 能力 |
| roles | 验证 + 跨环境名称契约 |
| policies | 验证 + `admin_access` / Public policy |
| access | 验证 + user-scoped 排除 |
| permissions | 验证 + license / 自定义规则 |
| folders | 增加 `type` 稳定键；media / flow 目录测试 |
| presets | 书签 / 默认视图；global / role；personal 排除 |
| translations | 多语言 / 分页 / 更新 / 删除 |
| settings | v3 新增受控声明 |
| flows / operations | v3.x 独立设计 |
| dashboards / panels | v3.x 独立设计 |
| users / files / items | 非目标，环境自管 |
| activity / revisions / notifications | 非目标，审计 / 内容数据 |

### v3 验收方式

- **本地矩阵**：`playground` + Directus 12.7.0 + SQLite，使用 `dsk` 命令逐项验证。
- **跨环境矩阵**：两个同版本、同数据库 vendor 的一次性实例（dev / target），通过 `d6s` profile 连接；不使用生产凭证。
- 每类资源至少覆盖：create、update、重复 apply `unchanged`、显式 delete、冲突、drift。
- d6s 至少覆盖：scope、`pull`、`diff`、`push merge`、`id_map`、重复 push `unchanged`、scope 排除、`mirror` 门禁、版本不一致阻断。
- 详细清单见 [v3 测试计划](./v3-test-plan.md)。

## v3.1 目标（3.1.0）

v3.1 的主题是 **平台默认初始化**。目标是让新项目自动获得统一的 settings、global preset、translations 和 folders 默认，而不是每个项目手动设置。

| 编号 | 目标 | 优先级 | 完成条件 |
| --- | --- | --- | --- |
| V3.1-1 | Settings 扩展 | P0 | 支持受控 `custom_css`（字符串）、`module_bar`（模块数组）、`theme_light_overrides` / `theme_dark_overrides`；校验结构、合并策略和敏感字段排除；API / Studio 回归 |
| V3.1-2 | 平台默认层与 `dsk bootstrap` | P0 | `init` 脚手架默认层；`bootstrap` 本地 dev only、幂等；默认 settings、`directus_presets` global preset、translations、folders；项目声明覆盖默认层；`reset` 后可重建 |

当前状态：**V3.1-1 Settings 扩展已实现**，单元测试与 Directus 12.7.0 API 验证通过；**V3.1-2 的 `bootstrap` 机制和默认 `directus_presets` 全局布局已实现**，但 settings / translations / folders 的具体默认内容仍需按项目填写。

### v3.1 不在范围

- 受管资源状态、Studio drift、`dsk status`：移到 v3.2。
- d6s 扩展矩阵和兼容性 patch 维护：移到 v3.2。
- Flows / Operations / Dashboards / Panels：放 v3.3 或独立设计。
- Schema collection / field 重命名、类型变更、存量数据迁移。
- Users / 业务内容 / 文件数据同步。
- DSK 直连生产；生产仍由 d6s 发布。

v3.1 建议实现顺序：Settings 扩展 → 平台默认层 / bootstrap。

## v3.2 目标（3.2.0）

| 编号 | 目标 | 优先级 | 完成条件 |
| --- | --- | --- | --- |
| V3.2-1 | 受管资源状态与 Studio drift | P0 | 本地 `projectId -> key -> ID` 状态（不入 Manifest、不提交）；按 ID 找回受管资源；Studio 改名/删除显示 drift / missing-managed 并阻断该项；未登记资源列为 unmanaged；不自动 rename / 创建副本 |
| V3.2-2 | `dsk status` / drift 报告 | P1 | 聚合 Schema + resources 的 drift、missing-managed、unmanaged、Manifest 新鲜度；支持 JSON 输出；不写入实例 |
| V3.2-3 | d6s 发布矩阵补全 | P1 | incomplete pull、多 target `id_map`、不同数据库 vendor 阻断、版本不一致回归；补文档和测试证据 |
| V3.2-4 | 兼容性维护 | P1 | 重新核对 `@directus/schema` 14.0.3 / 15.x 或 Directus 12.8 的 partial index 补丁；必要时更新 patch |

## v3.3 / 后续方向

| 优先顺序 | 方向 | 完成条件 |
| --- | --- | --- |
| 后续 | 团队级规则、可复用定义包和 drift 审查 | 明确规则入口、组合与冲突行为，并保持确定性输出和现有安全边界 |
| 待独立设计 | Flow、Operation、Dashboard、Panel 和受控 migration | 先明确资源生命周期、危险确认与失败恢复策略，经设计和安全评审后再实现 |

## 当前不做

- 字段或 collection 自动重命名、类型变更和存量数据迁移。
- 普通 apply 删除未声明资源、通用 down migration 或事务回滚。
- 测试、预发布、生产环境发布，以及 Directus 实例间同步。跨环境发布由 Directus 官方 Environment Sync（`d6s`）承担；DSK 保持本地开发定位，不扩展生产写入，也不替代官方备份／恢复能力。官方 `schema snapshot` 只覆盖 Schema，不包含 roles / policies / access / permissions 等配置资源，详见[环境与发布](../user/directus-development.md#环境与发布)。
- Web 管理界面、不受约束的自定义执行器或生命周期钩子。

遇到这些需求应先确认产品范围，不能通过绕过 Plan 或直接写数据库实现。

## 交付验收基线

- init 不覆盖已有文件，dry-run 不写入，非 Directus 项目不生成工作区。
- 相同源码生成字节级稳定、无解析后 secret、通过 JSON Schema 校验的 Manifest。
- validate 发现重复定义、无效关系、缺失引用和过期 Manifest。
- 首次 apply 建立完整 Schema，二次 plan 无可执行差异；seed 和八类系统资源重复执行收敛。
- 八类关系通过认证环境的构建、校验、应用和幂等检查，并在 Data Studio 正常编辑。
- conflict/dangerous 在任何 Schema 写入前阻断全部操作；危险操作有独立确认且始终保护系统集合。
- clean/reset 覆盖未声明的自定义集合，清理前全量检查引用；保留 settings、初始管理员及授权链、系统 Public policy 和运行／License 配置；reset 删除普通用户、业务授权配置和上传文件，重复执行安全。
- 版本化 JSON 输出、退出码和敏感值脱敏保持兼容。

具体开发规则见 [开发规则](../user/development-rules.md)，验证方法见 [DSK 实现与验收](./development.md)。若产品需求与建模规范冲突，以本文为准，并在变更说明中明确冲突。

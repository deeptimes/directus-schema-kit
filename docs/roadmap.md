# Roadmap 与产品边界

本文替代原 PRD，作为当前产品需求与验收基线。后续方向不代表已实现能力，也不承诺发布日期。

## 当前基线：Manifest V1

DSK 面向本地 Directus 项目，让数据模型和基础资源可以通过代码审查、离线校验和可重复初始化维护。它通过 Directus API 工作，不需要安装 Data Studio 扩展。

| 能力 | 当前交付 |
| --- | --- |
| 工作区 | `init` 幂等创建 `dsk/`；`doctor` 诊断项目与配置 |
| Schema | 严格 TypeScript DSL；八类关系 blueprint；Markdown、Tags、Code、Toggle helper |
| Manifest | 扁平、确定性 JSON，带源码 SHA-256 摘要；`build --check` 检查新鲜度 |
| 变更 | 离线 validate；只读 plan；全量预检后执行安全 create/update |
| 基础数据 | 版本化 JSON seed，自然键 upsert 和跨集合／同集合引用 |
| 系统资源 | settings、folders、roles、policies、access、permissions、presets、translations |
| 清理 | `clean` 清空全部自定义集合记录；`reset` 完整清理业务环境并保留管理员和基础配置；`clear` 保持仅清理声明 Schema 的兼容行为，真实删除必须确认 |
| 工程化 | 文本／版本化 JSON 输出、稳定退出码、凭证脱敏 |

CLI 接受 Directus 11.x 和 12.x；当前自动集成基线为 Node.js 22+，Directus 11.17.4 / 12.5.1 + SQLite。详细状态统一见 [兼容性](./compatibility.md)。

v3 目标基线：Directus **12.7.0** + SQLite；12.6.1 作为回退候选。`@directus/cli` 仍是 **12.5.1**，不要把它当成 Directus 服务器版本。

## v3 目标（3.0.0）

v3 的主题是 **Directus 系统模型资源全覆盖 + 逐项验收 + 本地安全硬边界**。v3 不把 DSK 变成生产部署工具；跨环境仍由官方 `d6s` 完成。

目标版本为 `3.0.0`；`package.json` 在 v3 验收通过后更新，避免提前把未完成能力标成正式版本。

| 编号 | 目标 | 优先级 | 当前状态 | v3 完成条件 |
| --- | --- | --- | --- | --- |
| V3-1 | 生产写入硬保护 | P0 | 代码与单元测试已实现，待 v3 命令级矩阵 | `safety.environment` 只接受 `development`；`allowedHosts` 默认 loopback、`10.0.0.0/8`、`192.168.0.0/16`、`.local`，默认阻止 `172.16.0.0/12` 和公网；`doctor` 与所有写命令统一校验；覆盖测试 |
| V3-2 | Settings 系统配置 | P0 | 已实现，单元测试与 Directus 12.7.0 API 验证通过 | 受控 scalar settings 声明（如 project name、default language、color）；只更新声明字段；环境本地 / 敏感字段排除；`reset` 继续保留；本地 + d6s 测试 |
| V3-3 | Folders / 文件管理目录 | P0 | 已实现，单元测试与 12.7.0 API 验证通过 | 稳定键加入 `type`（files / flows）；`name + parent + type`；重命名、移动、删除、文件引用阻断；测试 |
| V3-4 | Presets / 书签 | P0 | 已实现，单元测试与 12.7.0 API 验证通过 | global / role / personal preset、tabular、bookmark、collection、role；personal preset 不跨环境；重复执行收敛；测试 |
| V3-5 | Translations | P0 | 已实现，单元测试与 12.7.0 API 验证通过 | 多语言、`key + language`、>100 分页、更新 / 删除 / 空文字 / Unicode；测试 |
| V3-6 | 权限链 roles / policies / access / permissions | P0 | 已实现，单元测试与 12.7.0 简单权限链验证通过 | 名称契约、id_map、admin_access 审查、user-scoped 排除、Public policy；跨环境无重复；测试 |
| V3-7 | d6s 发布契约 | P0 | release checklist 已定；scope / pull / diff / push / id_map / mirror / rename 跨环境矩阵通过 | CLI 版本 pin、project `resources` / `excludeResources`、`--roles` / `--no-*`、`id_map`、release checklist |
| V3-8 | v3 测试矩阵 | P0 | 大部分完成：本地 12.7.0 API smoke 和 d6s 跨环境基础矩阵通过；license 自定义权限、>100 翻译、Studio 交互仍待执行 | playground 本地矩阵 + 双实例 d6s 矩阵；每类资源 create / update / unchanged / delete / conflict / drift |
| V3-9 | Manifest / 兼容性 | P1 | settings / folders / presets 校验已纳入 Manifest V1，暂不引入 V2 | 新资源类型是否需要 Manifest V2；若需要提供迁移；否则明确 V1 扩展 |
| V3-10 | Flows / Operations / Dashboards / Panels | P1（v3.x） | 待独立设计 | 先明确生命周期、危险确认和失败恢复；v3.0 不纳入，v3.x 单独评审 |
| V3-11 | Users / 内容 / 文件数据同步 | 非目标 | 明确边界 | 各环境自管；需要时独立设计，不用 DSK / d6s 做内容同步 |
| V3-12 | 补全 Directus 12.x 认证 | P0 | 12.7.0 基础生命周期、简单权限链和 d6s 跨环境通过；license 自定义权限 / Studio 待回归 | 有许可的自定义权限规则和 Data Studio 编辑回归完成 |

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

- **本地矩阵**：`playground` + Directus 12.7.0 + SQLite（12.6.1 回退），使用 `dsk` 命令逐项验证。
- **跨环境矩阵**：两个同版本、同数据库 vendor 的一次性实例（dev / target），通过 `d6s` profile 连接；不使用生产凭证。
- 每类资源至少覆盖：create、update、重复 apply `unchanged`、显式 delete、冲突、drift。
- d6s 至少覆盖：scope、`pull`、`diff`、`push merge`、`id_map`、重复 push `unchanged`、scope 排除、`mirror` 门禁、版本不一致阻断。
- 详细清单见 [v3 测试计划](./v3-test-plan.md)。

## v3.x / 后续方向

| 优先顺序 | 方向 | 完成条件 |
| --- | --- | --- |
| 后续 | 团队级规则、可复用定义包和 drift 审查 | 明确规则入口、组合与冲突行为，并保持确定性输出和现有安全边界 |
| 待独立设计 | Flow、Operation、Dashboard、Panel 和受控 migration | 先明确资源生命周期、危险确认与失败恢复策略，经设计和安全评审后再实现 |

## 当前不做

- 字段或 collection 自动重命名、类型变更和存量数据迁移。
- 普通 apply 删除未声明资源、通用 down migration 或事务回滚。
- 测试、预发布、生产环境发布，以及 Directus 实例间同步。跨环境发布由 Directus 官方 Environment Sync（`d6s`）承担；DSK 保持本地开发定位，不扩展生产写入，也不替代官方备份／恢复能力。官方 `schema snapshot` 只覆盖 Schema，不包含 roles / policies / access / permissions 等配置资源，详见[环境与发布](./directus-development.md#环境与发布)。
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

具体开发规则见 [开发规则](./development-rules.md)，验证方法见 [DSK 实现与验收](./development.md)。若产品需求与建模规范冲突，以本文为准，并在变更说明中明确冲突。

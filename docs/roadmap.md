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
| 系统资源 | folders、roles、policies、access、permissions、presets |
| 清理 | 仅清理完整 Manifest 声明的自定义 Schema，必须明确确认 |
| 工程化 | 文本／版本化 JSON 输出、稳定退出码、凭证脱敏 |

CLI 接受 Directus 11.x 和 12.x；当前自动集成基线为 Node.js 22+，Directus 11.17.4 / 12.5.1 + SQLite。详细状态统一见 [兼容性](./compatibility.md)。

## 后续方向

| 优先顺序 | 方向 | 完成条件 |
| --- | --- | --- |
| 优先 | 补全 Directus 12.x 认证 | 12.5.1 的独立集成生命周期与幂等检查已通过；继续验证有许可的自定义权限和 Data Studio 编辑体验 |
| 后续 | 团队级规则、可复用定义包和 drift 审查 | 明确规则入口、组合与冲突行为，并保持确定性输出和现有安全边界 |
| 待独立设计 | Flow、Operation、Dashboard、Panel 和受控 migration | 先明确资源生命周期、危险确认与失败恢复策略，经设计和安全评审后再实现 |

## 当前不做

- 字段或 collection 自动重命名、类型变更和存量数据迁移。
- 普通 apply 删除未声明资源、通用 down migration 或事务回滚。
- 测试、预发布、生产环境发布，以及 Directus 实例间同步。
- Web 管理界面、不受约束的自定义执行器或生命周期钩子。
- `.old/` 中旧教学中心业务模型及其数据迁移。

遇到这些需求应先确认产品范围，不能通过绕过 Plan 或直接写数据库实现。

## 交付验收基线

- init 不覆盖已有文件，dry-run 不写入，非 Directus 项目不生成工作区。
- 相同源码生成字节级稳定、无解析后 secret、通过 JSON Schema 校验的 Manifest。
- validate 发现重复定义、无效关系、缺失引用和过期 Manifest。
- 首次 apply 建立完整 Schema，二次 plan 无可执行差异；seed 和六类系统资源重复执行收敛。
- 八类关系通过认证环境的构建、校验、应用和幂等检查，并在 Data Studio 正常编辑。
- conflict/dangerous 在任何 Schema 写入前阻断全部操作；危险操作有独立确认且始终保护系统集合。
- 版本化 JSON 输出、退出码和敏感值脱敏保持兼容。

具体开发规则见 [开发规则](./development-rules.md)，验证方法见 [DSK 实现与验收](./development.md)。若产品需求与建模规范冲突，以本文为准，并在变更说明中明确冲突。

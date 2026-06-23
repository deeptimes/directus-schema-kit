# Directus Schema Kit 产品需求

> 状态：当前实现基线  
> 当前里程碑：Manifest V3  
> 包：`@deeptimes/directus-schema-kit`

## 产品定位

Directus Schema Kit（DSK）是面向本地 Directus 项目的声明式 Schema Provisioning 工具。开发者使用固定的 TypeScript DSL 定义 Schema 与系统资源，通过确定性 JSON Manifest 完成离线校验、差异规划和安全应用。

DSK 的目标是让 Directus 数据模型具备代码审查、类型约束、可重复初始化和安全变更能力。它不是通用数据库迁移框架，也不负责跨环境发布。

## 核心用户与场景

- Directus 开发者：初始化项目、维护字段和关系、管理基础数据。
- 技术负责人：统一建模规范，审查冲突和危险变更。
- 工程化维护者：在 CI 中校验 Manifest、源码新鲜度和输出契约。

主要场景：

1. 在已有 Directus 项目中初始化 `dsk/` 工作区。
2. 按业务文件维护 Schema，构建全局 Manifest。
3. 在写入前查看本地实例差异，并只应用安全变更。
4. 通过自然键幂等写入 seed，通过稳定业务键同步系统资源。
5. 在初始化阶段显式确认后清理 Manifest 声明的自定义 Schema。

## 当前交付范围

### 项目工作区

- `dsk init` 幂等生成配置、Schema、resources、seeds 和 generated 目录。
- 自动识别 Directus 项目，并从项目 `.env` 读取连接配置。
- TypeScript 定义按文件组织，但编译后属于同一个全局 Schema；文件不形成命名空间或局部 apply 范围。

### Schema 与 Manifest

- 严格类型的 `collection()`、`collectionGroup()`、`defineSchema()` 和 `field.*()` DSL。
- M2O、O2M、M2M、M2A、Translations、File、Image、Files 关系 blueprint。
- Markdown、Tags、Code、Toggle 等 Directus interface helper。
- Manifest V3：扁平、确定性、完整展开，并携带源码 SHA-256 摘要。
- 离线校验重复定义、主键、关系完整性、引用和源码新鲜度。

### Plan 与 Apply

- Plan 将差异分为 `create`、`update`、`unchanged`、`conflict`、`dangerous`。
- 普通 Apply 只执行安全创建和白名单更新；任一 conflict/dangerous 会在写入前阻断全部操作。
- 写入按依赖串行执行，失败后停止并报告部分成功，不承诺事务回滚。

### 数据与系统资源

- JSON seed 支持自然键 upsert、跨批次引用、plan 和 apply。
- 支持 folders、roles、policies、access、permissions、presets。
- 系统资源删除必须在定义中声明 `delete: true`，并提供 `--confirm-destructive`。
- Clear 仅处理 Manifest 中的全部非系统 collection；交互默认拒绝，脚本执行需要 `--confirm`。

### 工程能力

- 文本和版本化 JSON 输出。
- 稳定退出码和敏感信息脱敏。
- Node.js 22+、Directus 11.17.4、SQLite 的完整自动认证。

## 明确边界

当前不支持：

- 字段或 collection 自动重命名、类型变更和存量数据迁移。
- 普通 Apply 自动删除未声明资源。
- 通用 down migration 或事务回滚。
- 测试、预发布、生产环境发布，以及 Directus 实例间同步。
- Flow、Operation、Dashboard、Panel。
- Web 管理界面或不受约束的自定义执行器/生命周期钩子。
- 旧教学中心业务模型和数据迁移。

## 产品原则

1. 声明目标状态，执行前始终可查看计划。
2. 未知差异默认阻断，危险操作必须使用独立授权路径。
3. DSL 服务人工编写，Manifest 服务校验和执行。
4. 相同输入产生稳定输出，重复执行最终收敛为 unchanged。
5. `build` 只执行可信项目代码；`plan/apply` 不执行 TypeScript。
6. token、secret 和数据库凭证不得进入 Manifest、日志或报告。
7. PRD 与 Directus/DBML 规范冲突时以 PRD 为准，并在实现说明中记录冲突。

## 验收标准

- `init` 不覆盖已有文件，`--dry-run` 不写入，非 Directus 项目不生成工作区。
- `build` 生成字节级稳定、无 secret、通过 JSON Schema 校验的 Manifest V3。
- `validate` 能发现重复定义、无效关系、缺失引用和过期 Manifest。
- 首次 Apply 可建立完整 Schema；第二次 Plan 不存在可执行差异。
- 八类关系在 Directus 11.17.4 + SQLite 完成构建、校验、应用和幂等测试。
- Seed 与六类系统资源重复执行不产生重复数据。
- destructive 操作无明确确认时不写入，并始终保护 `directus_*`。
- JSON 输出、退出码和凭证脱敏通过契约测试。

## 后续方向

- 扩展 Directus 认证矩阵，Directus 12.x 在完整集成与 Data Studio 回归后再声明支持。
- 增强团队级规则、可复用定义包和 drift 审查能力。
- Flow、Dashboard 等资源和受控 migration 必须在独立设计与安全评审后引入。

不在本 PRD 中维护已完成任务流水、日期型决策记录或远期版本承诺；这些信息由 Git 历史和后续独立提案承载。

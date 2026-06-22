# Directus Schema Kit 产品需求文档

> 文档状态：Draft 1.1
> 更新日期：2026-06-21
> 产品简称：DSK  
> npm 包名：`@deeptimes/directus-schema-kit`  
> 目标形态：独立开发、独立发布、可持续迭代的开源优先 Node.js CLI 与开发工具包

## 1. 文档目的

本文档基于 `.old/` 中的原始 PRD、架构文档与已有实现重新梳理。新版产品不再从属于智慧教育平台，也不承载或迁移教材、课程、讲者等具体业务模型。

本文定义产品边界、目标用户、核心场景、独立版本需求、质量标准与迭代路线，作为后续架构设计、开发拆分和验收依据。

## 2. 产品概述

### 2.1 产品定位

Directus Schema Kit 是面向 Directus 项目的声明式 Schema Provisioning 工具。

用户通过 DSK 提供的固定 TypeScript Schema DSL 编写 collections、fields、relations、权限、角色和 Preset 等项目定义，所有源码、JSON 配置、seed 和生成产物统一保存在 `dsk/`。`dsk build` 将人工编写的 DSL 编译、校验为标准 JSON Manifest；`plan/apply` 只消费 Manifest，并将目标状态应用到本地开发用 Directus 实例。

产品优先解决以下阶段：

- 新项目从零建立数据模型。
- 不同 Directus 项目在各自 `dsk/` 目录中维护独立定义、配置和 seed。
- 多个本地项目复用统一字段、集合和 UI Meta 规范。
- 在本地开发或 CI 中校验 Schema，并审查定义与本地开发实例的状态差异。
- 对本地开发实例执行新增、更新和初始化阶段重建。

DSK 是本地开发工具包，不负责将 Schema 或数据同步到测试、预发布、生产等非本地环境。生产发布与跨环境同步由独立同步工具承担。DSK 强调项目内聚、按业务文件拆分、可编程定义和本地初始化体验。

### 2.2 产品愿景

让 Directus 数据模型像应用代码一样具备类型约束、版本管理、代码审查、自动校验和可控应用能力。

### 2.3 核心价值

- **效率**：减少在 Directus 后台重复创建集合、字段、关系和 UI Meta 的操作。
- **一致性**：保证代码定义与本地开发实例状态一致。
- **可审查**：执行前明确展示新增、更新、跳过、冲突和危险操作。
- **可复用**：通过稳定的 Schema DSL、业务定义文件和标准 Manifest 复用团队建模经验。
- **可治理**：将 Schema、seed 和执行记录纳入 Git 与 CI。
- **安全性**：默认不执行删除、改类型等高风险变更，危险操作必须显式授权。

## 3. 背景与问题

Directus 后台适合早期探索和少量手工配置，但项目进入团队协作后会出现以下问题：

1. 集合、字段和关系数量增加后，手工配置耗时且容易遗漏。
2. UI Meta、翻译、归档、审计字段等配置高度重复。
3. 本地 Directus 实例与代码定义容易漂移，问题通常在联调时才暴露。
4. 后台操作缺少天然的 Git 版本、代码评审和变更历史。
5. 单文件脚本会同时承载集合、字段、关系、权限和 seed，随着项目增长难以阅读、复用和维护。
6. seed 数据中的外键依赖运行时 ID，不同本地项目难以复用。
7. 删除集合、修改字段类型、调整关系等操作风险高，缺少统一护栏。
8. 原工具与智慧教育项目目录、脚本和中文字段字典耦合，无法直接作为通用包维护和发布。

## 4. 产品原则

1. **声明目标状态**：用户描述“最终应该是什么”，工具负责校验、规划和执行。
2. **计划先于写入**：任何本地 Directus 写入都应可先通过 `plan` 或 `--dry-run` 查看。
3. **安全默认值**：默认仅允许新增和明确认定的低风险更新。
4. **危险操作显式化**：删除、重命名、类型变化等不得由普通 `apply` 隐式执行。
5. **目录化优先**：Schema 按业务域拆分为 `dsk/schemas/*.ts` 文件，资源按类型拆分；文件只组织源码，不形成运行时模块或 Directus 命名空间。
6. **幂等执行**：相同定义重复执行不应失败，也不应产生重复资源或数据。
7. **双层模型**：TypeScript Schema DSL 优化人工编写体验，标准 JSON Manifest 优化机器校验、执行和工具间交换。
8. **核心与业务解耦**：核心包和 V1 交付物不得内置智慧教育业务语义或迁移旧教学中心数据。
9. **项目上下文优先**：DSK 自动读取 Directus 项目的 `.env` 和 `package.json`，避免重复维护项目基础信息。
10. **项目定义而非二次扩展**：`dsk/` 中的 TypeScript 只使用公开、固定的 Schema DSL 定义项目模型；V1 不提供 DSK 内核插件、自定义执行器或生命周期钩子。
11. **运行输入标准化**：`dsk/` 保存 JSON 配置、seed、生成的 Manifest 和目录说明文档；`plan/apply` 不直接执行 TypeScript。
12. **自动化友好**：命令需支持无交互执行、稳定退出码和机器可读结果。

## 5. 目标用户

### 5.1 核心用户

| 用户 | 主要诉求 | 使用频率 |
| --- | --- | --- |
| Directus 项目开发者 | 快速创建和迭代数据模型 | 高频 |
| 技术负责人/架构师 | 统一团队建模规范，审查变更风险 | 中高频 |
| 工程化负责人 | 统一本地开发初始化流程和 CI 校验 | 中频 |
| 解决方案团队 | 在多个客户项目中复用业务模块 | 中频 |

### 5.2 次要用户

- 需要理解数据模型但不直接执行命令的产品经理。
- 通过 Git Diff 审查 Schema 变更的测试和数据人员。
- 维护可复用 JSON 业务模块和项目模板的工具维护者。

### 5.3 暂不服务的用户

- 只使用 Directus 后台且不具备 Node.js/命令行环境的纯业务用户。
- 期望通过可视化界面完成数据库迁移设计的用户。
- 需要自动迁移复杂存量数据、跨数据库变换或零停机迁移的团队。

## 6. 核心使用场景

### 场景 A：初始化新项目

开发者在已有 Directus 项目中安装 DSK，执行一次 `pnpm dsk init`，自动生成统一的 `dsk/` 工作区、示例文件和说明文档；随后构建 Manifest、执行校验与计划，并将 collections、fields、relations、权限、角色、Preset、folders 和基础数据应用到本地空实例。

期望结果：新实例在一次标准流程后达到可开发状态。

### 场景 B：管理多个本地项目

开发者维护多个 Directus 项目。每个项目在 `dsk/` 中拥有独立的 TypeScript 定义、`config.json`、seeds 和 generated Manifest。

期望结果：不同项目的配置与数据互不混淆，项目内定义可以细粒度拆分，共享能力不依赖复制整份单文件脚本。

### 场景 C：新增业务定义

开发者引入一个独立业务定义文件，例如内容中心、工单或商品目录，并将其与项目已有 Schema 组合。

期望结果：不要求把所有定义集中在单一文件；构建后进行全局校验、规划和应用。

### 场景 D：维护基础数据

开发者使用自然键声明枚举、地区、分类等 seed 数据，并通过业务键引用其他记录。

期望结果：不同本地项目无需维护固定数据库 ID；重复执行时按自然键更新或创建。

### 场景 E：审查模型变更

本地开发或 Pull Request 检查执行 `validate`；需要实例状态时，针对本地开发实例执行 `plan`，输出人类可读摘要及 JSON 报告。

期望结果：评审者可以识别新增、更新、漂移、冲突和危险变更，CI 可依据退出码决定是否放行。

### 场景 F：初始化阶段重建

开发者在数据库初期建模和 DSK 调试阶段，明确确认后清理 Manifest 声明的全部自定义集合并重新应用。

期望结果：清理全部自定义 Schema；系统集合不可删除；执行前展示完整删除范围。

## 7. 产品范围

### 7.1 独立版 V1 范围

独立版 V1 聚焦“可发布、可复用、可审查的 Provisioning 工具”，包括：

- 独立 npm 包与 CLI。
- 在 Directus 项目根目录创建并管理统一的 `dsk/` 工作区。
- 支持通过 `pnpm dsk init` 一次性初始化目录、配置、示例和说明文档。
- 固定、版本化的 TypeScript Schema DSL API。
- 版本化 JSON Manifest 规范和配套 JSON Schema。
- `dsk build` 编译、校验并生成 Manifest。
- 自动识别 Directus 项目并读取项目 `.env` 与 `package.json`。
- 项目级 JSON 配置、目录化 DSL 文件和项目独立 JSON seed。
- Schema 加载、组合和严格校验。
- collections、fields、relations 的计划与应用。
- 权限、角色、Policy、Access、Preset 的完整读取、计划与本地同步。
- 安全的 Meta/Schema 属性更新白名单。
- folders 等基础系统资源初始化。
- 自然键、外键引用和幂等 seed。
- 仅支持全量自定义 Schema 的受保护 clear。
- 人类可读与 JSON 两种输出。
- 稳定退出码、日志脱敏和 CI 模式。
- 单元测试、集成测试、兼容性说明和最小使用文档。

### 7.2 明确不纳入 V1

- 字段或集合自动重命名。
- 字段类型自动变更。
- 已有业务数据迁移。
- 自动删除未在目标文件中声明的任意资源。
- 通用回滚和 down migration。
- Web 管理界面。
- 测试、预发布、生产环境的发布或同步。
- 多个 Directus 实例之间的同步。
- 替代 Directus 官方 snapshot/backup。
- Flow、Operation、Dashboard 和 Panel 的完整同步；移至 V2。
- 旧教学中心 Schema、章节数据和 `examples/education` 迁移。

## 8. 信息架构与核心对象

### 8.1 Directus Project

包含 Directus `package.json`、`.env` 和运行配置的项目目录。DSK 从当前工作目录向上识别项目根目录，并以该目录作为 `dsk/` 工作区的宿主。

### 8.2 DSK Project Workspace

DSK 项目使用一个目录承载职责明确的子目录和文件：

- `dsk/schemas/`、`dsk/resources/`：人工维护的 TypeScript 项目定义源码，只使用 DSK 公开 DSL。
- `dsk/config.json`、`dsk/seeds/`、`dsk/generated/`：配置、seed 和生成产物。

V1 推荐目录：

```text
directus-project/
  package.json
  .env
  dsk/
    README.md
    schemas/
      example.ts
    resources/
      folders.ts
      roles.ts
      policies.ts
      access.ts
      permissions.ts
      presets.ts
    config.json
    seeds/
      example/
        10-categories.json
    generated/
      manifest.json
```

目录约束：

- `dsk/schemas/*.ts` 按业务组织一个或一组强相关 collections；文件不形成命名空间，同名 collection 不得跨文件重复定义。
- `dsk/resources/` 按 Directus 系统资源类型组织；体量较大时允许继续按业务域拆分。
- TypeScript 定义只能依赖 DSK 公开 DSL 和项目内其他定义文件，不得依赖 DSK 内部源码。
- `dsk/` 下供工具读取的配置、seed 和 Manifest 统一使用严格 JSON，不支持注释、函数或可执行表达式；README Markdown 仅作为说明文档。
- `seeds/` 保存当前项目专属基础数据，可按业务建立子目录；文件名前缀用于表达默认执行顺序。
- `generated/manifest.json` 由 `dsk build` 生成，禁止手工编辑；是否提交 Git 由项目配置决定。
- `dsk/README.md` 统一说明 DSL 编写、文件拆分、配置、seed、generated 文件和禁止手改范围。
- 初始化示例默认导出空 Schema 或空数据，不应在用户未修改示例时创建真实业务集合或 seed 数据。
- DSK 按配置和文件名字典序确定性加载源码与 seed；引用依赖仍需经过解析和校验，不能只依赖文件顺序。
- 项目级命名、安全和校验选项直接写入 `config.json`，不建立可执行 policy 文件。
- V1 不提供 `dsk/extensions/`、自定义执行器、自定义校验函数或 DSK 生命周期钩子。

### 8.3 Config

`dsk/config.json` 是轻量项目入口，负责声明：

- 定义规范版本。
- Schema DSL、resources、seeds 和 generated Manifest 的路径规则。
- Directus 项目根目录识别方式。
- `.env` 加载规则及允许使用的连接变量名。
- `package.json` 中 Directus 依赖、版本与 scripts 的读取规则。
- 命名规则、安全策略、校验选项和允许的操作范围。
- 输出模式与默认语言。

连接信息优先复用 Directus 项目的 `.env`。配置中不得保存明文 token，也不得要求用户为 DSK 重复维护一份环境文件。

### 8.4 Schema DSL 文件

`dsk/schemas/*.ts` 是可独立加载和组合的人工编写文件，使用 DSK 提供的 `collection()`、`field.*()`、`relation.*()` 和 `defineSchema()` 等固定 DSL API。文件名用于业务组织和错误定位，不形成 Directus 命名空间或独立 apply/clear 范围。

所有文件编译后进入一个扁平 Manifest。collection 名全局唯一；一个 collection 只能由一个文件完整定义，其他文件可以通过 relation 引用它，但不得重复声明或局部扩展。

DSL 应采用对象参数而非大量位置参数；常用字段通过固定函数简写，复杂 Directus 属性允许通过受类型约束的高级配置表达。

推荐风格：

```ts
import { collection, field } from '@deeptimes/directus-schema-kit'

export default collection({
  name: 'edu_grades',
  label: '年级',
  icon: 'filter_1',
  displayTemplate: '{{ name }}',
  group: 'Education',
  order: 2,
  primaryKey: 'integer',
  fields: [
    field.sort({ order: 2 }),
    field.status({ order: 3 }),
    field.m2o('stage_id', {
      label: '学段',
      order: 4,
      required: true,
      collection: 'edu_stages',
      displayTemplate: '{{ name }}',
    }),
    field.string('slug', { label: '标识', order: 5, unique: true, width: 'half' }),
    field.string('name', { label: '名称', order: 6, required: true, width: 'half' }),
    field.text('description', { label: '描述', order: 7 }),
  ],
})
```

#### 8.4.1 Directus 字段与关系对齐模型

DSK 必须区分 Directus 中三个不同层次的概念，避免把 Data Studio 界面名称误当成数据库字段类型：

- **Field Type**：字段的存储或逻辑类型，例如 `string`、`text`、`json`、`uuid`、`alias`、`csv`。
- **Interface**：Data Studio 的编辑界面，例如 Markdown、Tags、Code 和 Toggle；同一 Interface 可能支持多个 Field Type。
- **Relational Type**：关系语义，例如 M2O、O2M、M2M、M2A、Translations、File 和 Files。

普通字段界面使用 `field.*` helper 表达；一个声明只对应一个字段。关系使用 `relation.*` blueprint 表达；blueprint 可以在 build 阶段确定性展开为 alias field、实体字段、junction collection 和多条 relation。不得使用只返回单一字段的不完整 helper 模拟复合关系。

目标公开 API 至少包括：

```ts
field.markdown('content', { label: '正文' })
field.tags('tags', { label: '标签' })
field.code('config', { label: '配置', type: 'json' })
field.toggle('enabled', { label: '启用' })

relation.m2o({ /* ... */ })
relation.o2m({ /* ... */ })
relation.m2m({ /* ... */ })
relation.m2a({ /* ... */ })
relation.translations({ /* ... */ })
relation.file({ /* ... */ })
relation.image({ /* ... */ })
relation.files({ /* ... */ })
```

现有 `field.m2o()` 作为兼容简写保留，并编译到统一的关系定义。复杂关系生成的 junction collection 名称、主键、外键、排序字段和删除策略必须显式声明或遵循文档化的确定性默认值。

本轮以 Directus 11.17.4 为完整实现和自动验收基线；Directus 12.x 作为兼容性评估目标。在 12.x 未进入认证矩阵前，不以 latest 行为覆盖 11.17.4 的稳定语义。

### 8.5 Resource Definition

Resource Definition（系统资源定义）描述 Directus 的 folders、roles、policies、access、permissions 和 presets。Directus 11.17.4 的 permission 必须绑定 policy，role-policy 关联由 access 模型维护，因此 policies 和 access 不得省略。每类资源具有独立类型、稳定业务键和引用解析规则，默认使用 `dsk/resources/<resource-type>.ts` 中对应的固定 DSL 定义。

“完整同步”是指 DSK 能读取本地实例当前状态、生成差异，并执行创建、更新和显式确认后的删除；不是指把资源发布到其他 Directus 环境。

### 8.6 Declarative Reference

Schema DSL、Resource DSL 和 seed JSON 通过稳定引用表达运行时信息：

- DSL 使用 `env("VARIABLE_NAME")` 声明环境变量引用，编译后保留为 Manifest 中的 `$env` 标记，禁止把敏感值写入 Manifest。
- DSL 使用 `ref("roles.editor")` 引用另一个资源的稳定业务键；seed JSON 使用对应的 `$ref` 对象。
- DSL 使用 `systemRef("policies.public")` 只读引用 Directus 内置 Public policy；运行时解析环境内真实 ID，不得创建、更新或删除该系统资源。
- seed 外键通过 collection、匹配字段和业务值声明，由 DSK 在本地实例解析真实 ID。
- 对未知引用类型、缺失环境变量和循环依赖必须在写入前报错。

### 8.7 Generated Manifest

`dsk/generated/manifest.json` 是 Schema DSL 和 Resource DSL 的标准化编译结果，也是 DSK 执行层与未来独立同步工具之间的稳定交换格式。

Manifest 必须：

- 包含 manifest 规范版本、生成工具版本和来源摘要。
- 使用完全展开的 collections、fields、relations 和系统资源定义，不包含函数。
- 保留 `$env`、`$ref` 等声明式引用，但不包含解析后的 secret。
- 具有确定性输出；相同源码生成字节级稳定结果，时间戳等易变信息不得影响内容 Diff。
- 生成后再次通过 JSON Schema 校验。

### 8.8 Plan

Manifest 目标状态与本地开发实例当前状态比较后的标准化操作集合。每个操作至少包含：

- 资源类型与唯一标识。
- 操作类型：create、update、skip、conflict、dangerous。
- 当前值、目标值与差异摘要。
- 风险等级和是否可由当前命令执行。

### 8.9 Seed Batch

针对单个 collection 的数据批次，支持：

- `items` 数据。
- `defaults` 默认值。
- `upsertBy` 单字段或组合自然键。
- `refs` 跨集合或同集合引用。
- 明确的执行顺序和依赖错误。

### 8.10 JSON 文件约定

`dsk/` 中的 config、seed 和 generated Manifest 必须包含版本信息，不得直接使用没有版本信息的裸数组。V1 采用以下统一外形：

`dsk/config.json`：

```json
{
  "schemaVersion": 1,
  "paths": {
    "schemaSource": "schemas/**/*.ts",
    "resourceSource": "resources/**/*.ts",
    "seeds": "seeds/**/*.json",
    "manifest": "generated/manifest.json"
  }
}
```

`dsk/seeds/content/10-categories.json`：

```json
{
  "schemaVersion": 1,
  "collection": "categories",
  "upsertBy": ["slug"],
  "items": []
}
```

`dsk/generated/manifest.json`：

```json
{
  "manifestVersion": 3,
  "generator": {
    "name": "@deeptimes/directus-schema-kit",
    "version": "1.0.0"
  },
  "collections": [],
  "fields": [],
  "relations": [],
  "resources": {}
}
```

DSK 应为每类 JSON 文档提供对应 JSON Schema，并在错误中报告文件路径和 JSON Pointer。

## 9. 核心流程

### 9.1 标准工作流

```text
识别 Directus 项目根目录
  -> 读取 package.json、.env 与 dsk/config.json
  -> 加载并类型检查 dsk/ 中的 Schema DSL 与 Resource DSL
  -> 编译、标准化并校验 generated/manifest.json
  -> 加载并校验 dsk/seeds/ JSON
  -> 读取本地开发实例当前状态
  -> 生成 Plan 并进行风险分类
  -> 输出计划 / CI 审查
  -> Apply 可执行操作
  -> 输出结果摘要与机器报告
```

### 9.2 新项目推荐命令流

```bash
pnpm dsk init
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply
pnpm dsk resources apply
pnpm dsk seed
```

`dsk init` 创建统一的 `dsk/` 工作区、示例和说明文档；`dsk build` 生成标准 Manifest；`dsk resources apply` 负责应用本地 Directus 系统资源，三者职责不得合并。

### 9.3 安全清理流程

```text
读取 Manifest 声明的全部自定义集合
  -> 计算集合与关系依赖
  -> 排除 directus_* 系统资源
  -> 输出删除顺序与影响范围
  -> 交互确认，或在非交互模式要求 --confirm
  -> 删除关系字段及集合
  -> 输出成功、跳过和失败列表
```

## 10. 功能需求

需求优先级采用 P0（发布必需）、P1（应有）、P2（后续增强）。

### 10.1 安装、项目初始化与配置

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| CFG-01 | P0 | 以 npm package 发布，并提供 `dsk` 可执行命令。 |
| CFG-02 | P0 | 支持 pnpm、npm、yarn 和 bun 可调用的标准 Node.js 包形态。 |
| CFG-03 | P0 | 支持在已安装 DSK 的 Directus 项目中通过 `pnpm dsk init` 执行初始化。 |
| CFG-04 | P0 | 支持 `dsk/config.json`，并提供版本化 JSON Schema 用于校验和编辑器提示。 |
| CFG-05 | P0 | 从当前目录向上识别 Directus 项目，并读取项目 `package.json`。 |
| CFG-06 | P0 | 从 `package.json` 识别 Directus 依赖版本、包管理器信息和相关 scripts，为兼容性检查与命令提示提供依据。 |
| CFG-07 | P0 | 默认读取 Directus 项目根目录的 `.env`，并支持 Directus 常用连接变量及显式变量映射。 |
| CFG-08 | P0 | `.env` 中的 token、secret 和数据库凭证不得出现在普通日志、错误摘要和 JSON 报告中。 |
| CFG-09 | P0 | 支持 `--cwd` 和 `--config`，确保 monorepo 和非标准目录可用。 |
| CFG-10 | P0 | Schema DSL、Resource DSL 和 seeds 支持按约定目录拆分；DSK 根据配置确定性加载，不要求单一大入口文件。 |
| CFG-11 | P1 | 项目脚手架生成最小 DSL 示例、JSON 配置、seed 示例和 npm scripts，但不额外生成重复的 `.env`。 |
| CFG-12 | P1 | `dsk doctor` 报告项目识别结果、Directus 版本、`.env` 加载来源和 `dsk/` 完整性，但对敏感值脱敏。 |
| CFG-13 | P0 | init 创建 `dsk/schemas/`、`dsk/resources/`、`dsk/seeds/`、`dsk/generated/` 及必要父目录。 |
| CFG-14 | P0 | init 创建 `dsk/config.json`、安全的空示例 Schema/Resource/Seed 和 `dsk/README.md`；随后复用 build 流程生成初始 Manifest。 |
| CFG-15 | P0 | init 必须幂等；重复执行只补充缺失目录和文件，默认不得覆盖用户已修改的内容。 |
| CFG-16 | P0 | init 执行前识别 Directus `package.json`；无法确认是 Directus 项目时停止并说明原因，不在任意目录生成文件。 |
| CFG-17 | P0 | init 完成后输出创建、保留、跳过的文件清单，以及 build、validate、plan 的下一步命令。 |
| CFG-18 | P1 | init 支持 `--dry-run`，只展示将创建的目录和文件。 |

### 10.2 Schema DSL 与 Manifest 构建

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| DSL-01 | P0 | 导出固定、版本化、支持 TypeScript strict mode 的 Schema DSL API。 |
| DSL-02 | P0 | collection、field 和 resource DSL 使用对象参数，避免依赖难以辨认的大量位置参数。 |
| DSL-03 | P0 | 提供 `collection()`、`field.string()`、`field.text()`、`field.m2o()`、`field.status()`、`field.sort()`、审计字段等常用固定函数。 |
| DSL-04 | P0 | 支持 UUID 与自增 integer 主键，以及字段 Meta、Schema、翻译、界面、显示、宽度、默认值、必填和唯一等属性。 |
| DSL-05 | P0 | M2O 等关系可跟随字段声明；`onDelete` 等关系属性必须经过类型和合法值校验。 |
| DSL-06 | P0 | 多个 DSL 文件组合时检测重复 collection、field、relation 和系统资源定义；collection 名全局唯一。 |
| DSL-07 | P0 | `dsk build` 加载 DSL、展开简写、标准化定义并生成 `dsk/generated/manifest.json`。 |
| DSL-08 | P0 | Manifest 输出必须确定、无函数、无 secret，并通过版本化 JSON Schema 校验。 |
| DSL-09 | P0 | `plan/apply` 只读取 Manifest，不直接加载或执行 TypeScript DSL。 |
| DSL-10 | P0 | 支持 `env()`、`ref()`、`systemRef()` 和 seed 外键引用；编译后转换为标准声明式引用。 |
| DSL-11 | P0 | 配置、seed 和 Manifest 均提供版本化 JSON Schema。 |
| DSL-12 | P1 | 中文翻译可作为 `config.json` 中的项目校验选项开启，但不得成为核心包的强制规则。 |
| DSL-13 | P1 | DSL API 或 Manifest 规范升级必须包含版本号、迁移说明和兼容性校验。 |
| DSL-14 | P1 | 提供 `dsk build --check`，用于检查 Manifest 是否与源码一致而不改写文件。 |
| DSL-15 | P0 | DSL 类型模型区分 Field Type、Interface 和 Relational Type，并以 Directus 11.17.4 官方类型为认证基线。 |
| DSL-16 | P0 | Field Type 覆盖 Directus 11.17.4 的公开类型；不适合作为用户声明入口的 `unknown` 等内部类型必须明确限制。 |
| DSL-17 | P0 | 提供 `field.markdown()`、`field.tags()`、`field.code()` 和 `field.toggle()`，并为常用 Interface options 提供严格类型。 |
| DSL-18 | P0 | 提供 M2O、O2M、M2M、M2A、Translations、File、Image 和 Files 的固定关系 DSL。 |
| DSL-19 | P0 | 复合关系通过 Relation Blueprint 确定性展开为完整 collections、fields 和 relations，不允许只生成 alias field 或残缺 junction。 |
| DSL-20 | P0 | M2A 支持 Directus 允许的 nullable `related_collection`、collection discriminator 和 allowed collections。 |
| DSL-21 | P0 | 现有 `field.m2o()` 保持源码兼容；无模块结构使用 Manifest V3，旧 Manifest 必须提示重新 build。 |
| DSL-22 | P1 | 高级配置保留受类型约束的 `interface`、`options`、`display`、`displayOptions` 和 relation meta 逃生口。 |

### 10.3 校验

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| VAL-01 | P0 | `validate` 可在不连接 Directus 的情况下完成本地结构校验。 |
| VAL-02 | P0 | 校验主键、字段唯一性、关系完整性、引用目标和枚举值。 |
| VAL-03 | P0 | 错误必须包含源码文件、资源路径、原因和修复提示。 |
| VAL-04 | P0 | 校验失败返回非零退出码，且不得产生本地 Directus 写入。 |
| VAL-05 | P1 | 支持项目策略校验，例如命名规则、必需翻译、默认 accountability 和审计字段。 |
| VAL-06 | P1 | 提供 `--format json` 供 IDE 或 CI 消费。 |
| VAL-07 | P0 | validate 同时检查 DSL 类型、DSL 输出、Manifest JSON Schema、seed JSON Schema 和 Manifest 新鲜度。 |
| VAL-08 | P0 | validate 检查复合关系展开结果，包括 alias、junction、外键、目标集合、主键兼容性和 relation meta 完整性。 |
| VAL-09 | P0 | validate 检测重复或冲突的自动生成 junction collection、字段和 relation。 |

### 10.4 Plan 与差异识别

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| PLN-01 | P0 | `plan` 读取本地开发实例并输出目标差异，不执行写入。 |
| PLN-02 | P0 | 能区分 create、safe update、unchanged、conflict 和 dangerous。 |
| PLN-03 | P0 | 输出按资源和源码文件定位的操作摘要及计数。 |
| PLN-04 | P0 | 对字段类型、nullable、unique、主键、关系目标变化至少标记为危险或冲突。 |
| PLN-05 | P0 | 支持 JSON 输出，并保证同一版本内结构稳定。 |
| PLN-06 | P1 | Schema plan 始终基于完整 Manifest，不提供可能遗漏跨文件依赖的模块过滤。 |
| PLN-07 | P1 | 支持 CI 漂移检测：存在未允许差异时返回约定退出码。 |
| PLN-08 | P2 | 支持保存 plan artifact，并在 apply 时校验本地实例状态未发生变化。 |
| PLN-09 | P0 | Manifest 缺失或与 DSL 源码不一致时拒绝 plan，并提示先执行 `dsk build`。 |
| PLN-10 | P0 | Plan 必须识别目标 Directus 的数据库客户端；仅在 SQLite 下将 Directus 对 decimal 的 float、空 precision/scale 归一化视为等价，其他数据库仍按危险约束差异处理。 |

### 10.5 Apply

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| APP-01 | P0 | 按 group、collection、field、relation 的依赖顺序执行。 |
| APP-02 | P0 | 支持创建缺失的 collections、fields 和 relations。 |
| APP-03 | P0 | 对允许列表中的 collection/field Meta 和安全 Schema 属性执行更新。 |
| APP-04 | P0 | 重复执行同一目标状态应成功，且第二次计划无可执行差异。 |
| APP-05 | P0 | 默认拒绝执行 dangerous 操作。 |
| APP-06 | P0 | 单项失败时明确报告已完成、失败和未执行操作，不得输出模糊的整体成功。 |
| APP-07 | P0 | 网络超时、限流和可重试服务端错误采用有上限的退避重试。 |
| APP-08 | P1 | Schema apply 始终应用完整 Manifest，不提供按文件或模块过滤。 |
| APP-09 | P1 | 支持并发读取；写入顺序必须保持依赖正确和结果确定。 |
| APP-10 | P2 | 支持基于已保存 plan 的受控 apply。 |
| APP-11 | P0 | apply 只消费已校验且与源码一致的 Manifest。 |
| APP-12 | P0 | 复合关系的创建顺序通过 Directus 11.17.4 集成测试确定，并保证首次创建成功和第二次 apply 幂等。 |

### 10.6 Seed

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| SED-01 | P0 | seed source 统一使用 JSON。 |
| SED-02 | P0 | 支持按 `id` 或 `upsertBy` 自然键幂等创建/更新。 |
| SED-03 | P0 | 支持 defaults 和跨集合 refs。 |
| SED-04 | P0 | 引用不存在、自然键缺失或组合键不完整时立即失败，不得静默创建错误数据。 |
| SED-05 | P0 | 支持同集合父子引用，并通过显式顺序或依赖解决。 |
| SED-06 | P0 | `seed --dry-run` 至少校验文件结构、批次顺序和静态引用格式。 |
| SED-07 | P1 | 连接本地开发实例的 plan 模式预判 create/update 数量与无法解析的引用。 |
| SED-08 | P1 | 大批量 seed 支持分页读取、批处理和进度摘要。 |
| SED-09 | P2 | 支持可配置的 update 策略，例如仅创建、覆盖或指定字段更新。 |

### 10.7 Directus 系统资源同步

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| SYS-01 | P0 | 支持幂等创建 Directus folders。 |
| SYS-02 | P0 | 支持父子 folder 依赖及清晰的引用方式。 |
| SYS-03 | P0 | 支持 roles、policies 和 access 关联的完整读取、差异识别、创建、更新和受控删除。 |
| SYS-04 | P0 | 支持 permissions 的完整读取、差异识别、创建、更新和受控删除，并可通过稳定业务键引用 policy。 |
| SYS-07 | P0 | 支持 Directus presets 的完整读取、差异识别、创建、更新和受控删除。 |
| SYS-08 | P0 | 系统资源默认按 `folders.ts`、`roles.ts`、`policies.ts`、`access.ts`、`permissions.ts`、`presets.ts` 分类；体量较大时允许配置多个同类型 DSL 文件。 |
| SYS-09 | P0 | 资源间引用使用稳定名称或显式 key，运行时解析本地实例 ID，不在定义中固化实例生成的 ID。 |
| SYS-10 | P0 | 删除和覆盖敏感权限等操作必须在 plan 中单独标记；真实执行需要显式确认。 |

### 10.8 Clear 与危险操作

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| CLR-01 | P0 | 交互式终端执行 `clear` 时，必须先输出完整计划，再以默认否定的 `y/N` 提示确认；仅输入 `y` 或 `yes` 才执行真实删除。 |
| CLR-02 | P0 | 删除范围仅限完整 Manifest 声明的全部自定义集合；不支持局部 collection 或文件范围。 |
| CLR-03 | P0 | 永远拒绝删除 `directus_*` 系统集合。 |
| CLR-04 | P0 | 根据真实关系计算先子后父的删除顺序。 |
| CLR-05 | P0 | 输出受影响关系字段、集合和失败项。 |
| CLR-06 | P0 | 非交互终端、JSON 输出和 `--dry-run` 只输出计划；CI/脚本真实执行必须提供 `--confirm`。 |
| CLR-07 | P1 | 支持项目策略完全禁用 clear。 |
| CLR-08 | P2 | 支持导出执行前快照引用，但不承诺自动恢复。 |
| CLR-09 | P1 | `clear` 不接受模块、文件或 collection 参数，语义固定为清理全部自定义 Schema。 |

### 10.9 日志、报告与退出码

| 编号 | 优先级 | 需求 |
| --- | --- | --- |
| OBS-01 | P0 | 默认输出简洁的人类可读日志和最终摘要。 |
| OBS-02 | P0 | `--format json` 输出机器可读结果，stdout 不混入装饰性文本。 |
| OBS-03 | P0 | 定义稳定退出码，至少区分成功、校验失败、有危险差异、执行失败和配置错误。 |
| OBS-04 | P0 | 所有错误需包含操作、资源标识和 Directus 响应摘要，并移除凭证。 |
| OBS-05 | P1 | 支持 verbose/debug，但 debug 仍必须脱敏 Authorization。 |
| OBS-06 | P1 | 报告包含工具版本、目标 Directus 版本、耗时和操作计数。 |

## 11. CLI 初步设计

```bash
# 项目与本地定义
dsk init [--dry-run]
dsk build [--check]
dsk validate [--config dsk/config.json] [--format text|json]

# 本地开发实例状态
dsk plan [--format text|json]
dsk apply [--dry-run]

# 基础资源和数据
dsk resources apply [--dry-run] [--confirm-destructive]
dsk seed [path] [--dry-run]

# 初始化阶段危险操作
dsk clear [--dry-run]
dsk clear --confirm

# 诊断
dsk doctor
dsk version
```

CLI 名称和层级在技术设计阶段可以调整，但必须保持以下语义：

- `pnpm dsk init` 是标准初始化入口，默认不覆盖已有项目文件。
- validate 不连接 Directus，也不写入。
- plan 只连接当前项目的本地开发实例，但不写入。
- apply 只执行 plan 中允许的安全操作。
- clear 在交互式终端中先展示计划并默认拒绝执行；非交互真实删除必须显式提供 `--confirm`。

## 12. 非功能需求

### 12.1 兼容性

- 支持 Node.js 22 及以上版本。
- 当前仅认证 Directus 11.17.4，不使用“理论兼容”表述。
- 每次发布记录已验证的 Directus 版本范围和已知差异。
- Linux、macOS 为 V1 必测平台；Windows 通过 CI 验证文件路径和 CLI 基本流程。

### 12.2 性能

- 本地 validate 在 100 collections、2,000 fields 的定义规模下目标耗时小于 2 秒。
- plan 应避免按字段重复拉取全量状态，优先批量读取和缓存。
- 1,000 条常规 seed 在本地开发环境下应提供可观察进度；具体耗时基线在集成测试后确定。

### 12.3 可靠性

- 所有本地 Directus API 写操作必须有明确超时。
- 重试仅用于超时、限流和可恢复服务端错误，不重试确定性的 4xx 定义错误。
- 部分成功必须返回失败状态并列出已完成操作。
- 日志和 JSON 报告必须能支持用户定位失败资源。

### 12.4 安全

- 不持久化 Directus token。
- 不在命令参数中推荐传入 token，避免 shell history 泄漏。
- clear 和未来 destructive migration 必须使用独立授权路径。
- `dsk build` 会加载当前项目的 TypeScript DSL，因此只应在可信项目源码中运行；不得将其描述为安全沙箱。
- `plan/apply` 只读取 `dsk/` JSON 和 Manifest，不使用动态 import、`eval` 或其他方式执行项目代码。
- JSON 中的 `$env` 只能读取 `config.json` 允许的变量，敏感值不得进入 plan、日志或报告。
- 依赖发布启用 lockfile、依赖审计和最小发布文件清单。

### 12.5 可维护性

- 核心代码使用 TypeScript strict mode。
- CLI、Schema DSL、Manifest 编译器、JSON 校验器、规划引擎、执行引擎和 Directus adapter 分层。
- 核心规划逻辑通过纯数据结构测试，不依赖真实 Directus。
- API 和 JSON 报告发生破坏性变化时遵循语义化版本。

## 13. 成功指标

V1 发布后使用以下指标评估产品是否有效：

| 指标 | 目标 |
| --- | --- |
| 本地空实例首次初始化成功率 | 在支持版本集成测试中 100% |
| CLI 脚手架初始化成功率 | 在标准 Directus 项目中执行 `pnpm dsk init` 后目录、示例和文档完整生成 |
| 幂等性 | 连续第二次 apply 无可执行差异 |
| 危险操作误执行 | 默认 apply 路径为 0 |
| CI 可用性 | validate/plan 均有稳定 JSON 和退出码 |
| 新项目上手时间 | 熟悉 Directus 的开发者 15 分钟内建立 `dsk/` 工作区并完成本地实例初始化 |
| 核心自动化测试 | 规划、安全策略和执行路径具备高覆盖；具体阈值在测试策略中定义 |

不将 npm 下载量作为首版唯一成功标准。首版更关注真实项目采用、幂等性、故障可定位性和版本兼容质量。

## 14. V1 验收标准

满足以下条件才可定义为独立版 V1：

1. 在标准 Directus 项目中执行 `pnpm dsk init`，能正确读取 `package.json` 和 `.env`，并生成标准 `dsk/` 工作区。
2. init 生成安全的空示例、`dsk/config.json`、初始 Manifest 和 `dsk/README.md`，并输出下一步命令。
3. init 重复执行不覆盖已有文件，只补充缺失内容；`--dry-run` 不产生文件写入。
4. 非 Directus 项目执行 init 时不创建目录，并给出可操作的错误说明。
5. 示例 Schema/Resource DSL 在 TypeScript strict mode 下通过类型检查，配置、seed 和 Manifest 通过对应 JSON Schema 校验。
6. validate 能发现重复定义、缺失主键、无效关系和不合法删除策略。
7. plan 能基于本地开发实例输出 create、safe update、conflict、dangerous 和 unchanged。
8. apply 能完成 collection groups、collections、fields、relations 和允许属性的幂等应用。
9. folders、roles、policies、access、permissions、presets 和自然键 seed 可重复执行，不产生重复资源或数据。
10. roles、policies、access、permissions、presets 均覆盖读取、差异识别、创建、更新和带显式确认的删除流程。
11. 默认 apply 不执行字段删除、集合删除、类型变更和关系目标变更。
12. clear 仅在交互式计划经 `y/yes` 确认，或非交互提供 `--confirm` 时清理全部自定义集合，并永远排除系统集合。
13. text 与 JSON 输出均通过契约测试，token 不出现在日志中。
14. 至少在声明支持的 Node.js、Directus 和操作系统矩阵上通过自动集成测试。
16. 示例项目的定义已按 Schema 业务文件、resource types 和 seed 目录拆分，不存在承担全部业务定义的单一大文件。
17. `dsk build` 能生成确定、无 secret、完全展开且通过 JSON Schema 校验的 Manifest。
18. Manifest 缺失或落后于 DSL 源码时，plan/apply 会拒绝执行并提示重新 build。
19. plan/apply 不执行 TypeScript，只消费配置、seed 和 Manifest JSON。
20. README、快速开始、Schema DSL、Manifest 规范、安全边界和兼容矩阵齐备。

### 14.1 Directus DSL 对齐迭代验收标准

本轮迭代在满足以下条件后完成：

1. Markdown、Tags、Code、Toggle 均可通过类型安全 helper 声明，不要求用户手写 interface ID。
2. M2O、O2M、M2M、M2A、Translations、File、Image、Files 均能生成完整且可应用的 Manifest。
3. M2M、Files、Translations 和 M2A 生成的 junction collection、实体字段、alias 字段及 relation meta 均通过静态校验。
4. 旧有 `field.m2o()` 示例保持源码兼容；Manifest V1/V2 项目通过重新 build 迁移到 V3。
5. 每种新增 helper 覆盖 DSL 单元测试、Manifest 快照、validate、plan 幂等和 Directus 11.17.4 SQLite 集成测试。
6. 在 Directus Data Studio 中完成新增字段的创建、编辑、选择和展示人工验收。
7. 输出 Directus 12.x 兼容性评估结果；未验证能力不得标记为正式支持。

## 15. 版本路线图

### V1：Standalone Provisioning

- 完成独立包、`pnpm dsk init` 脚手架、统一 `dsk/` 工作区、Manifest 构建链路、项目识别、validate、plan、apply、seed、V1 系统资源同步、clear 护栏与 CI 输出。

### V1.1：Directus DSL 对齐

- 区分 Field Type、Interface 和 Relational Type。
- 补齐 Directus 11.17.4 字段类型及 Markdown、Tags、Code、Toggle helper。
- 引入 Relation Blueprint，支持 M2O、O2M、M2M、M2A、Translations、File、Image 和 Files。
- 升级 Manifest 关系模型、校验、计划和应用顺序；旧 Manifest 通过重新 build 迁移。
- 完成 Directus 11.17.4 自动验收和 Directus 12.x 兼容性评估。

### V1.2：团队规范与定义复用

- 更丰富的项目校验与安全配置项。
- 可共享的 Schema DSL 定义包。
- 可复用业务定义包与版本元数据。
- `dsk/` 业务文件模板与目录约束增强。

### V1.3：本地 Drift 与项目治理

- CI 漂移检测策略。
- 可保存并校验的 plan artifact。
- 变更摘要和审计报告。
- 更完整的 Directus 版本适配层。

### V2：扩展资源与 Migration-lite

- Flow 及 Operations 的完整读取、计划、创建、更新和受控删除。
- Dashboard 及 Panels 的完整读取、计划、创建、更新和受控删除。
- 为低风险变更提供明确 migration 文件。
- relation Meta 和安全约束调整。
- 危险差异生成待处理清单，不自动执行。
- 迁移执行记录和版本状态。

### V3：受控 Migration

- 显式字段重命名和类型变更策略。
- 删除集合/字段的审批与备份前置检查。
- 声明式数据迁移操作或与独立迁移工具集成。
- 补偿式恢复策略。

V3 是否实现通用回滚需根据 Directus API、数据库差异和真实需求重新评估，不提前承诺。

## 16. 原项目能力迁移判定

| 原有能力 | 新版处理 |
| --- | --- |
| collection/group/field/relation helper | 整理为固定、版本化的 Schema DSL API；改用对象参数并保留常用字段简写 |
| collection 和 field Meta patch | 迁移，但通过 plan 和安全属性白名单约束 |
| relation 已存在时直接跳过 | 改为比较并报告差异；V1 不自动修改危险差异 |
| dry-run | 合并到标准 plan 语义，保留 `--dry-run` 兼容入口的可行性 |
| 自然键 seed 与 refs | 迁移并补充本地实例预检、批量能力和 JSON Schema |
| folders 初始化 | 迁移到 `dsk/resources/folders.ts`，编译进入 Manifest |
| roles/policies/access/permissions/presets | 纳入 V1 完整本地同步，使用对应 Resource DSL 并编译进入 Manifest |
| flows/operations/dashboards/panels | 移至 V2，不作为 V1 验收或兼容承诺 |
| accountability 批量更新 | 改为 `config.json` 配置项或显式资源命令，不作为孤立核心概念 |
| clear | 保留为全量自定义 Schema 清理，并增加确认和 CI 保护 |
| 中文字段翻译强制校验 | 下沉为 `config.json` 中的可选校验项 |
| 教学中心 Schema、章节数据与 Markdown 生成器 | 不迁移，不进入 DSK 产品范围 |
| `.mjs` 定义 | 提供到新版 TypeScript DSL 的转换工具或迁移指南；plan/apply 不加载 `.mjs` |

## 17. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Directus 不同版本 API/Meta 结构变化 | apply 失败或错误差异 | 建立版本探测、adapter 和集成测试矩阵 |
| 将 Meta 更新误判为安全 | 影响后台体验或数据约束 | 使用明确白名单；未知差异默认 conflict |
| Schema 文件之间定义冲突 | 结果不确定 | 组合阶段阻断并给出源码文件和资源路径 |
| 部分写入后失败 | 实例处于中间状态 | 预先 plan、确定性顺序、结果报告和可重试幂等设计 |
| clear 或系统资源同步误删本地数据 | 本地开发数据丢失 | 默认展示计划、交互默认否定、非交互显式确认、配置禁用和系统集合硬保护 |
| JSON 引用解析错误 | 写入错误资源或泄漏环境变量 | 写入前完整解析和校验；限制 `$env` 白名单；报告始终脱敏 |
| DSL 执行不可信项目代码 | 本机安全风险 | 明确 `dsk build` 的可信代码边界；plan/apply 只消费 Manifest，不执行 DSL |
| Manifest 与 DSL 源码不一致 | 应用过期模型 | 记录源码摘要；build check、plan 和 apply 必须检查 Manifest 新鲜度 |
| 产品范围膨胀为通用迁移框架 | 延误独立版发布 | V1 坚持 provisioning，危险迁移进入后续独立里程碑 |

## 18. 待确认产品决策

以下问题不阻塞 PRD 第一版，但应在技术方案和发布计划前确认：

1. 首发开源协议及仓库可见性。
2. 支持的最低 Node.js 与 Directus 版本矩阵。
3. Schema DSL 与 Manifest 规范的首个版本号、`env()`/`ref()` 编译结果和 JSON Schema 发布方式。
4. npm 包是否长期使用 `@deeptimes/directus-schema-kit`，CLI 是否固定为 `dsk`。
5. 是否提供旧 `.mjs` 到新版 TypeScript DSL 的一次性转换命令，或仅提供迁移文档。
6. safe update 的字段 Schema 白名单具体包含哪些属性。
7. JSON report 的公开稳定等级及版本字段设计。
8. roles、policies、access、permissions、presets 各自采用何种稳定业务键，以及哪些差异必须要求额外确认。

## 19. 后续交付物

PRD 确认后建议按顺序补充：

1. 技术架构与模块边界设计。
2. Schema DSL API、Manifest 规范、引用语法与配置 Schema 草案。
3. Plan 数据模型和安全变更分类表。
4. CLI 命令与退出码规范。
5. V1 用户故事、开发任务和里程碑。
6. 测试策略与 Directus 兼容矩阵。

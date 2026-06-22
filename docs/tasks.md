# V1 开发任务

- [x] npm 包、严格 TypeScript 与 CLI 基础
- [x] Schema DSL、确定性 Manifest、JSON Schema
- [x] 幂等 init、build、validate
- [x] Plan 数据模型与安全分类
- [x] collections/fields/relations 只读 Adapter
- [x] `dsk plan` 完整 Manifest 的文本/JSON 输出
- [x] 安全 apply Adapter 与执行编排
- [x] Seed plan/apply
- [x] folders、roles、policies、access、permissions、presets
- [x] clear 护栏
- [x] Directus 11.17.4 单一认证环境端到端 CI
- [x] `dsk doctor` 与环境变量脱敏诊断
- [x] 快速开始、DSL、Manifest 和安全边界文档
- [x] JSON 输出契约、token 脱敏和发布前检查

## V1.1 Directus DSL 对齐迭代

### 产品与兼容基线

- [x] 确认 Directus 11.17.4 为本轮完整实现与自动验收基线
- [x] 确认 Directus 12.x 仅作为兼容性评估目标，不直接覆盖认证基线
- [x] 在 PRD 中区分 Field Type、Interface 和 Relational Type
- [x] 建立 Directus 11.17.4 字段类型、界面、关系与 DSK API 的完整映射表
- [x] 明确 Directus 12.x 的字段与关系差异，并输出兼容性结论

### DSL 与类型模型

- [x] 补齐 Directus 11.17.4 Field Type 类型定义
- [x] 补齐 Field Meta、Field Schema 和 Relation Meta 的必要类型
- [x] 支持 M2A 所需的 nullable `related_collection`
- [x] 设计并实现 `RelationBlueprint` 及其确定性展开协议
- [x] 定义 junction collection 的命名、主键、外键、排序字段和删除策略默认值
- [x] 保留 `field.m2o()` 源码兼容，并接入统一关系模型
- [x] 升级 Manifest V3、JSON Schema 和旧版本迁移错误提示

### 普通字段 helper

- [x] 实现 `field.markdown()`
- [x] 实现 `field.tags()`，覆盖 `json` 和 `csv` 存储选择
- [x] 实现 `field.code()`，覆盖 Directus 支持的 string、text、json 类型
- [x] 实现 `field.toggle()`，映射 Directus `boolean` interface 并提供常用 options
- [x] 补充 time、timestamp、bigInteger、float、csv 等基础字段构造器
- [x] 为新增 helper 保留高级 interface/options/display 配置入口

### 关系 helper

- [x] 完善 M2O relation meta 和 options
- [x] 实现 O2M blueprint
- [x] 实现 File blueprint，目标固定为 `directus_files`
- [x] 实现 Image blueprint，并提供图片 MIME 类型默认约束
- [x] 实现 M2M blueprint 和显式 junction 配置
- [x] 实现 Files blueprint
- [x] 实现 Translations blueprint，包括翻译集合和 languages 关系
- [x] 实现 M2A blueprint，包括 collection discriminator 和 allowed collections

### Build、Validate、Plan 与 Apply

- [x] build 将关系 blueprint 完全展开为确定性 Manifest
- [x] validate 检查 alias、junction、外键、目标集合和 relation meta 完整性
- [x] validate 检测自动生成资源与用户定义资源的重复和冲突
- [x] plan 正确归一化 alias 字段、nullable related collection 和 relation meta
- [x] 明确 relation meta 的安全更新、conflict 和 dangerous 分类
- [x] 验证并固化 collection、实体字段、relation、alias 字段的创建顺序
- [x] 确保复合关系首次 apply 成功且第二次 plan 无可执行差异

### 测试与文档

- [x] 为每个新增普通字段 helper 增加 DSL 单元测试和 Manifest 快照
- [x] 为每种关系增加展开、校验、plan 和 apply 测试
- [x] 在 Directus 11.17.4 + SQLite 完成全部新增能力的集成测试
- [ ] 在 Data Studio 完成创建、编辑、选择和展示人工验收
- [x] 更新 Schema DSL、Manifest、快速开始和兼容矩阵文档
- [x] 增加从 Manifest V1/旧 `field.m2o()` 迁移到新版 DSL 的说明
- [x] 执行 typecheck、单元测试、集成测试和发布前检查

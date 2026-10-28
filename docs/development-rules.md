# 开发规则

本文合并原 Directus / DBML 规范、Schema 编写规则和安全边界。修改 Schema、DBML、resource 或 seed 前必须阅读；产品范围以 [Roadmap 与产品边界](./roadmap.md) 为准。

## 源码与执行边界

- 先阅读业务项目现有规则及 `dsk/schemas/`、`resources/`、`seeds/`，延续业务命名和组织方式。
- 只从 `@deeptimes/directus-schema-kit` 导入公开 API；不发明 helper、字段类型或内部导入路径。
- `build` 会执行可信项目 TypeScript，不是安全沙箱；plan/apply 只消费 JSON Manifest，不执行 DSL。
- 不手写或编辑 `dsk/generated/manifest.json`。修改定义后重新 build、validate，再查看 plan。
- collection 全局唯一，一个 collection 只能在一个文件完整定义；其他文件通过 relation 引用。文件名、`source` 和 UI group 不构成 namespace 或局部执行范围。
- 普通 apply 只允许安全 create/update，不自动删除、重命名、变更类型或迁移存量数据。白名单外差异默认阻断。

## 命名与建模

| 对象 | 规则 |
| --- | --- |
| collection / field / DBML 表列 | 小写 `snake_case`，不使用驼峰、连字符、空格、拼音或 SQL 保留字 |
| 业务 collection | 默认复数，如 `articles`、`course_lessons`；禁止 `directus_` 前缀 |
| 主键 | 自身主键统一 `id`，业务表优先 UUID；不使用 `{table}_id` 或无必要的复合主键 |
| 内容状态 | `status`，默认考虑 draft / published / archived；不叠加同义状态字段 |
| 手动排序 | 整数 `sort`；order / position / sequence 仅用于独立业务含义 |
| 布尔字段 | `is_` 前缀，如 `is_active`、`is_featured` |
| 业务时间 | `date_` 前缀，如 `date_published`；明确时区和精度，纯日期用 date，具体时间点用 timestamp |
| 用户关系 | `user_` 前缀，如 `user_owner`，关联 `directus_users` |
| 普通 M2O | 单数业务名，如 `category`；多角色区分 reviewer / approver，自关联统一 `parent` |
| 常用内容字段 | slug / title / name / summary / content / description；结构化扩展数据才使用 metadata JSON |

字段不重复表名，避免缺乏业务含义的 data / info / value / type。普通 Directus 关系字段不强制 `_id`；底层技术外键和 blueprint 自动生成字段按其已有约定处理。

审计字段使用 `...field.audit()`，在 `fields` 数组中必须展开。标准字段为 `date_created`、`date_updated`、`user_created`、`user_updated`；不使用 created_at / updated_at / created_by / updated_by / creator_id / updater_id。创建时间和创建用户不应被后续修改。

## 字段与关系

- Field Type 与 interface / display / special 分开，Markdown、Tags、Code、Toggle 是界面 helper；不使用 Directus 内部 `unknown` 类型。
- 优先使用 `relation.*` blueprint；`field.m2o()` 保留兼容。完整示例统一见 [Schema DSL](./schema-dsl.md)。
- O2M alias 是虚拟展示字段，不能当作真实数据库列写入 DBML。
- 单文件使用语义化字段名如 cover / avatar / document，关联 `directus_files`；多文件、多用户和 M2M 使用关联表，不用 JSON 数组或逗号分隔 ID。
- M2M、Files、Translations、M2A 必须展开完整 junction、字段与 relations，不用单 alias 模拟。复合关系的两条 junction relations 需通过 `meta.junction_field` 互相引用。
- 自动 junction 默认隐藏并归入来源 collection；无需额外业务字段时交给 blueprint。若中间模型具有状态、审计或独立生命周期，显式建模为普通 collection。
- 同一 collection 多个 Files 字段必须指定不同 `junction.collection`。自动命名、主键和删除策略以公开 DSL 默认值为准，不套用手写 DBML 模板。
- 外键删除行为按业务设计，避免意外级联删除重要内容。

## DBML 补充约束

DBML 是建模说明，不是 DSK 执行输入；建模要求需通过当前 DSL / Manifest 能力落实，不支持的约束应明确说明，不能发明 API。

- 所有真实外键声明 `ref`，必填列声明 `[not null]`；不重新定义或修改 `directus_*` 系统表。
- 手写多对多关联表优先 `{table_a}_{table_b}`，包含 `id`、两侧单数关系字段，需排序时添加整数 `sort`。关系字段组合应有唯一约束。
- slug、业务编码等唯一标识使用数据库唯一约束；按实际查询考虑状态、时间和外键索引，不能只依赖应用层校验。
- 审计用户字段关联 `directus_users.id`；`date_created` 为必填 timestamp，`date_updated` 可空。
- 不直观的表列添加 `note`；枚举说明允许值，关系说明删除行为或生命周期。注释解释业务含义，不重复字段名。

## 系统资源与 Seed

- 系统资源放在 `dsk/resources/`，除非现有项目已有明确组织方式；普通 Schema 不声明或修改 `directus_*` collection。
- 不硬编码 role、policy、user 等环境 UUID。自定义资源用稳定业务键引用，内置 Public policy 用 `systemRef('policies.public')`；不重复创建系统 policy。
- Seed 只做本地基础数据初始化，使用版本化 JSON、自然键和稳定业务键引用，重复执行不产生重复数据。
- 不声明 Flow、Operation、Dashboard、Panel，当前版本不支持。

## 安全与写入授权

- 只允许连接 localhost、RFC1918 私网和 `.local`；DSK 不承担生产发布或实例间同步。
- token、secret、密码、数据库凭证和真实隐私数据不得写入 Manifest、seed、日志或报告；敏感定义使用 `env()` 引用。
- Schema apply 遇到任一 conflict/dangerous 全量阻断；实例额外资源不会被推断为删除。
- `resources apply` 删除系统资源必须声明 `delete: true`，并额外提供 `--confirm-destructive`；独立 `reset` 按已确认的完整清理计划删除目标资源。
- clear 仅针对完整 Manifest 的自定义 Schema；交互先展示范围并以 `y/N` 确认，非交互真实删除必须 `--confirm`；永远保护 `directus_*`。
- `clean` 清空实例全部自定义集合记录并保留结构与资源；`reset` 删除全部自定义 Schema、普通用户、业务授权资源、预设、上传文件和文件夹。两者展示代码声明项与未声明项，保护 settings、保留管理员记录及授权链、系统 Public policy；不写 License 配置、不调用 bootstrap、不删除数据库文件。settings／保留管理员或其他保留资源引用待删对象时，在任何写入前阻断，不置空引用绕过。
- `clean`／`reset` 受 `safety.clearEnabled` 控制，支持 `--dry-run`、默认拒绝的交互确认和非交互 `--confirm`；执行前重读检查计划，执行后验证保留配置、管理员授权及剩余目标。
- Apply、Seed、资源同步及 clean/reset 串行执行，首项失败即停止；Clear 则记录单项失败并继续，最后汇总结果。均不承诺事务回滚。网络重试有上限，确定性 4xx 和 DELETE 的 HTTP 失败响应不重试。
- AI 修改完成后运行 build、validate，涉及实例差异再 plan；只有任务明确授权写入对应本地实例，并完成计划审查后，才执行真实 apply、resources apply、seed 或 clear。

## 给 AI 的提示词

```text
为当前 Directus 项目编写 DSK schema。先阅读业务项目已有规则、dsk/ 定义，以及 DSK docs/roadmap.md、docs/development-rules.md、docs/schema-dsl.md 和 docs/manifest.md。只使用公开 API，关系优先用 relation.*，不手改 Manifest。修改后 build、validate，涉及实例差异再 plan。没有明确写入授权时只生成和审查计划。
```

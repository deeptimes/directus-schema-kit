# 兼容性

## 验证矩阵

升级评估日期：2026-10-26。npm `latest` 与官方 release 均为 **12.5.1**，playground 固定使用此版本。

| Directus | 自动验证 | 待验证范围 |
| --- | --- | --- |
| 11.17.4 + SQLite | provisioning 生命周期、八类关系、Seed、六类系统资源、幂等、权限过滤和 Clear 通过 | 其他数据库与版本需单独验证 |
| 12.5.1 + SQLite | 新实例及 11.17.4 数据库迁移副本通过同一生命周期；Core 自定义权限阻断通过 | 含有效 license 的自定义权限与完整 Data Studio 编辑回归 |

CLI 接受 11.x 和 12.x，不表示所有小版本、数据库或许可能力都已认证。CI 同时运行上述两个固定版本；当前 v12 测试使用 Core，不能据此宣称博客会员权限已经可用。

## v12 对 DSK 的影响

| 上游变化 | 对本项目的影响与处理 |
| --- | --- |
| v12 引入 license 能力与数量限制 | Core 下自定义 permission 可能被拒绝或忽略；博客的发布状态、会员、当前用户、字段限制、validation 和 presets 依赖相应能力。资源同步前根据实际服务版本读取 `/license`，未启用 `custom_permission_rules_enabled` 或查询失败时，在任何资源写入前停止；不移除规则降级 |
| `/server/health` 需要认证 | CI 等待服务改用公开的 `/server/ping`；DSK 的 Schema Reader 不依赖 health |
| 新集合默认使用 boolean Archived | 这是 Studio 默认值变化。DSK 显式声明的字符串 `status` 仍可使用，保留现有 DSL 与业务规则 |
| v12.2 的 WYSIWYG 改用 Tiptap | 当前公开 helper 使用 Markdown，不依赖 TinyMCE。通过高级 interface/options 自定义 WYSIWYG 的项目需检查旧配置和 HTML 内容 |
| v12.4 调整 nullable 类型、权限校验与地图组件依赖 | Kit 使用 REST，不依赖 SDK 或 Studio 组件；嵌套编辑仍需人工验证相应角色的读取权限，地图需要 WebGL2 |
| v12.5 调整 TFA 与 license 错误信息 | DSK 不调用 license 激活／续期接口；许可能力检查只消费 entitlements，不依赖旧 downgrade_reason 或错误码 |

对比 v11.17.4 与 v12.5.1 的官方 `fields.ts`、`relations.ts` 没有差异；八类关系在实际 API 测试中通过，因此不引入新的 Manifest 版本或重写关系 blueprint。

Core 的 collection 等限额仍由 Directus 执行，DSK 不预留配额或绕过限制。资源同步预检以权限声明保守判断是否需要自定义规则；自定义 `ResourceReader` 若用于直接调用 `syncResources()`，应实现可选 `getCustomPermissionRulesEnabled()`，CLI 使用的 Reader 已实现。

## 本次回归修复与升级注意

- `field.boolean()` / `field.toggle()` 默认添加 `special: ['cast-boolean']`，确保 SQLite API 返回布尔值，Seed 才能收敛。已存在的字段可能因此出现 `meta.special` dangerous；应审查并通过独立变更补齐 Meta，或显式保留 `special: []`，不能绕过 Plan 自动改写。
- `seed --plan` 支持引用本次计划中更早出现的新增项，并匹配 scope；计划内未知 ID 使用 `__dsk_seed_plan__:` 占位，只用于报告与后续引用，真实 Seed 始终重新读取实例并解析真实 ID。
- playground 的 `dateTime` Seed 改为不带时区的 `YYYY-MM-DDTHH:mm:ss`。跨时区的绝对时间应使用 timestamp，不能让无时区 dateTime 隐式转换 UTC 输入。
- 更新依赖不会迁移数据库；先备份，再运行 `pnpm --dir playground bootstrap`，由 Directus 执行自身系统迁移。不要用 DSK clear 代替版本迁移，也不要将迁移后的数据库直接交给 v11。

## 工具链

| 项目 | 支持范围 |
| --- | --- |
| Node.js | 22+ |
| Manifest | V1 |
| 操作系统 | CI 使用 Linux；日常开发支持 macOS |

## Field Type 映射

| 类别 | DSK / Directus Field Type |
| --- | --- |
| 标量 | `bigInteger`, `boolean`, `date`, `dateTime`, `decimal`, `float`, `integer`, `json`, `string`, `text`, `time`, `timestamp`, `binary`, `uuid` |
| 逻辑 | `alias`, `hash`, `csv` |
| Geometry | `geometry`, `geometry.Point`, `geometry.LineString`, `geometry.Polygon`, `geometry.MultiPoint`, `geometry.MultiLineString`, `geometry.MultiPolygon` |
| 不开放 | `unknown`（Directus 内部兜底） |

Interface 与 Field Type 分离。Markdown、Tags、Code、Toggle 分别映射到 Directus interface，不是新的 Field Type。

## Relational Type 映射

| Directus relational type | DSK API | 展开资源 |
| --- | --- | --- |
| M2O | `relation.m2o()` / `field.m2o()` | 外键字段 + relation |
| O2M | `relation.o2m()` | 多方外键 + relation + 一方 alias |
| File / Image | `relation.file()` / `relation.image()` | Directus 单文件专用界面、`special: file`、预览显示与 MIME 限制 |
| M2M | `relation.m2m()` | junction + 两个外键 + 两条 relation + alias |
| Files | `relation.files()` | Directus Files 专用 alias、隐藏 junction、缩略图展示与 MIME 限制 |
| Translations | `relation.translations()` | translations junction + languages relation + alias |
| M2A | `relation.m2a()` | junction + discriminator + nullable-target relation + alias |

评估依据：[Directus 11.17.4 字段常量](https://github.com/directus/directus/blob/v11.17.4/packages/constants/src/fields.ts)、[Directus 11.17.4 Relation 类型](https://github.com/directus/directus/blob/v11.17.4/packages/types/src/relations.ts)、[Directus 12.5.1 字段常量](https://github.com/directus/directus/blob/v12.5.1/packages/constants/src/fields.ts)、[Directus 12.5.1 Relation 类型](https://github.com/directus/directus/blob/v12.5.1/packages/types/src/relations.ts)、[Directus 12.0.0 发布说明](https://github.com/directus/directus/releases/tag/v12.0.0)、[Directus 12.2.0 发布说明](https://github.com/directus/directus/releases/tag/v12.2.0)、[Directus 12.4.0 发布说明](https://github.com/directus/directus/releases/tag/v12.4.0)、[Directus 12.5.0 发布说明](https://github.com/directus/directus/releases/tag/v12.5.0) 和 [Directus 12.5.1 发布说明](https://github.com/directus/directus/releases/tag/v12.5.1)。

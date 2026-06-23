# 兼容性

## 认证状态

| Directus | 状态 | 结论 |
| --- | --- | --- |
| 11.17.4 + SQLite | 正式认证 | 单元测试和完整 provisioning 集成测试覆盖 |
| 12.0.2 | 结构评估 | Field Type、Relational Type 和 Relation Meta 与 11.17.4 一致；尚未进入自动 Apply 认证矩阵 |

Directus 12.0.2 官方类型中的字段常量、关系类型和 Relation Meta 与 11.17.4 相同，因此当前 Manifest 没有发现字段/关系结构级阻断差异。但 Directus 12 引入许可执行，并改变新集合默认归档字段等产品行为；DSK 仍拒绝把 12.x 标记为正式支持，直到完成独立集成和 Data Studio 回归。

## 工具链

| 项目 | 支持范围 |
| --- | --- |
| Node.js | 22+ |
| Manifest | V3 |
| 操作系统 | CI 使用 Linux；日常开发支持 macOS |

## Field Type 映射

| 类别 | DSK / Directus 11.17.4 Field Type |
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

评估依据：[Directus 11.17.4 字段常量](https://github.com/directus/directus/blob/v11.17.4/packages/constants/src/fields.ts)、[Directus 11.17.4 Relation 类型](https://github.com/directus/directus/blob/v11.17.4/packages/types/src/relations.ts)、[Directus 12.0.2 字段常量](https://github.com/directus/directus/blob/v12.0.2/packages/constants/src/fields.ts)、[Directus 12.0.2 Relation 类型](https://github.com/directus/directus/blob/v12.0.2/packages/types/src/relations.ts) 和 [Directus 12.0.0 发布说明](https://github.com/directus/directus/releases/tag/v12.0.0)。

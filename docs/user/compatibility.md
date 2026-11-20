# 兼容性

## 认证基线

当前 v3.0 认证基线：Node.js 22+、Directus **12.7.0** + SQLite。`@directus/cli` **12.5.1** 用于跨环境发布，是独立包，不是 Directus 服务器版本。

| Directus | 已验证 | 待验证 |
| --- | --- | --- |
| 12.7.0 + SQLite | bootstrap、doctor、schema apply / 二次 plan unchanged、seed、settings、folders、presets、translations、roles / policies / access / permissions、license 自定义权限过滤、>100 Translation Strings / 字段条件、clean / reset、d6s pull / diff / push / mirror 删除 | Data Studio 自定义权限视觉回归；Flows / Dashboards 不在 v3.0 范围 |

其他 Directus 版本、数据库 vendor 和部署方式不在当前认证范围；需要时单独验证，不能把“代码接受”当作已认证。

Manifest 的 `manifestVersion: 1` 是 `dsk/generated/manifest.json` 的格式版本，不是 Directus 版本，也不是 DSK 包版本。

## 关键约束

- v12 自定义权限过滤、字段限制、validation 和 presets 依赖 `custom_permission_rules_enabled`。资源同步（包括 dry-run）会检查实际服务许可；未启用或查询失败时，在任何资源写入前停止，不移除规则降级。
- 无自定义规则的全字段 permission 应明确声明 `fields: ['*']`；缺省 fields 不等于不受许可限制。
- `field.boolean()` / `field.toggle()` 默认添加 `special: ['cast-boolean']`，保证 SQLite API 返回布尔值。已有字段因此出现 `meta.special` dangerous 时，需要审查并独立变更。
- `dateTime` 表示不带时区的时间，Seed 使用 `YYYY-MM-DDTHH:mm:ss`；跨时区绝对时间使用 timestamp。
- Core 的 collection 等限额仍由 Directus 执行，DSK 不预留配额或绕过限制。

## SQLite 条件唯一索引兼容补丁

Directus 12.7.0 使用的 `@directus/schema@14.0.2` 在识别 SQLite 单列唯一索引时未排除 `partial = 1`，会把条件唯一误报为字段全局唯一。REST `/fields` 不提供索引条件，DSK 无法仅凭响应安全区分两者，因此严格比较 `schema.is_unique`，不忽略差异、不删除索引。

`@directus/schema` 当前 latest 仍是 **14.0.2**，上游 `packages/schema/src/dialects/sqlite.ts` 的 `main` 分支仍只读取 `unique`，没有检查 `partial`。因此补丁在 12.7.0 上仍然必要。等 14.0.3 / 15.x 或 Directus 12.8 发布后重新核对上游实现。

兼容方案是在**运行 Directus 的项目**中安装 [14.0.2 补丁](../patches/@directus__schema@14.0.2.patch)，在上游 inspector 中跳过 partial index。补丁只修正索引识别，不修改数据库；普通单列唯一仍返回 true，复合唯一与条件唯一不会作为字段全局唯一。同字段同时存在条件唯一与全局唯一索引时，仍识别为全局唯一。

使用 pnpm 的项目，将补丁复制到项目的 `patches/@directus__schema@14.0.2.patch`，合并以下配置到项目根目录的 `pnpm-workspace.yaml`（保留原有配置）：

```yaml
patchedDependencies:
  '@directus/schema@14.0.2': patches/@directus__schema@14.0.2.patch
```

执行 `pnpm install` 并提交补丁、配置和更新后的 lockfile，然后重启 Directus 以重建 schema 缓存，重新运行 `dsk plan`。发布包中的补丁位于 `node_modules/@deeptimes/directus-schema-kit/docs/patches/`。仅升级 DSK 不会自动修补其他项目或 Docker 镜像中的 Directus 依赖。

补丁锁定 14.0.2，升级 Directus 或 inspector 时必须重新核对，不能强行应用到其他版本。条件索引的创建、迁移与删除仍由业务项目独立管理，DSK 不据此管理索引生命周期。

## 工具链

| 项目 | 支持范围 |
| --- | --- |
| Node.js | 22+ |
| Manifest | 格式 V1 |
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

接口依据以 [Directus 12.7.0 字段常量](https://github.com/directus/directus/blob/v12.7.0/packages/constants/src/fields.ts) 和 [Relation 类型](https://github.com/directus/directus/blob/v12.7.0/packages/types/src/relations.ts) 为准。

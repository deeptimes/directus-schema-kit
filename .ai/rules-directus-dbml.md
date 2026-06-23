# DBML 与 Directus 数据库命名规范

生成或修改 DBML 时，必须遵循以下规范。

### 基础命名

- 表名和字段名统一使用小写 `snake_case`。
- 禁止使用驼峰、PascalCase、连字符、空格或拼音。
- 名称应表达业务含义，避免 `data`、`info`、`value`、`type` 等含义模糊的名称。
- 表名默认使用复数形式，例如 `articles`、`course_lessons`。
- 字段名不重复表名，例如在 `articles` 中使用 `title`，不要使用 `article_title`。
- 避免使用 SQL 保留字，例如 `order`、`group`、`user`、`references`。
- 已存在的 Directus 系统字段和系统表命名不得自行改写。

### 系统表

- Directus 核心系统表必须以 `directus_` 开头，例如：
  - `directus_users`
  - `directus_roles`
  - `directus_files`
  - `directus_activity`
- 普通业务表禁止使用 `directus_` 前缀，避免与 Directus 系统表冲突。
- 不要在 DBML 中重新定义或修改 Directus 核心系统表，除非 PRD 明确要求。

### 主键

- 默认主键统一命名为 `id`。
- 推荐使用 UUID 作为业务表主键：
  ```dbml
  id uuid [pk]
  ```
- 不使用 `{table_name}_id` 作为表自身主键。
- 不使用无业务必要的复合主键；关联表除外。

### Directus 审计字段

需要记录创建和更新时间时，统一使用：

```dbml
date_created timestamp [not null]
date_updated timestamp
```

需要记录创建和更新用户时，统一使用：

```dbml
user_created uuid [ref: > directus_users.id]
user_updated uuid [ref: > directus_users.id]
```

规则：

- 时间审计字段使用 `date_` 前缀。
- 用户审计字段使用 `user_` 前缀。
- 禁止使用以下替代命名：
  - `created_at`
  - `updated_at`
  - `created_by`
  - `updated_by`
  - `creator_id`
  - `updater_id`
- `date_created`、`date_updated`、`user_created`、`user_updated` 应作为一组标准字段使用。
- `date_created` 和 `user_created` 创建后不应修改。

### 业务时间字段

- 业务日期或时间字段统一使用 `date_` 前缀，例如：
  - `date_start`
  - `date_end`
  - `date_published`
  - `date_expired`
  - `date_cancelled`
  - `date_archived`
- 布尔语义不得伪装成时间字段。例如使用 `is_published` 表示状态，使用 `date_published` 表示实际发布时间。
- 时间字段应明确时区和精度；跨时区业务优先使用带时区的时间类型。
- 纯日期字段可使用 `date` 类型，具体时间点使用 `timestamp` 类型。

### 用户关联字段

- 关联 `directus_users` 的字段统一使用 `user_` 前缀，例如：
  - `user_created`
  - `user_updated`
  - `user_owner`
  - `user_assigned`
  - `user_approved`
- 字段必须定义外键关系：
  ```dbml
  user_owner uuid [ref: > directus_users.id]
  ```
- 多用户关联使用独立关联表，不使用逗号分隔字符串或 JSON 数组存储用户 ID。

### 状态字段

- Directus 内容状态统一使用 `status`。
- 状态值默认考虑：
  - `draft`
  - `published`
  - `archived`
- 不同时创建语义重叠的字段，例如 `status`、`state`、`is_active`。
- 简单二态业务可以使用 `is_` 前缀的布尔字段，例如：
  - `is_active`
  - `is_featured`
  - `is_required`
  - `is_default`
- 布尔字段禁止使用模糊名称，例如 `active`、`enabled`、`featured`。

### 排序字段

- Directus 手动排序字段统一命名为 `sort`。
- `sort` 使用整数类型：
  ```dbml
  sort integer
  ```
- 不使用 `order`、`position`、`sequence` 代替 Directus 标准排序字段，除非它们具有不同的明确业务含义。

### 关系字段

- 多对一关系字段优先使用单数业务实体名，例如：
  ```dbml
  category uuid [ref: > categories.id]
  ```
- 同一张表存在多个指向相同目标表的关系时，必须体现角色，例如：
  - `parent`
  - `author`
  - `reviewer`
  - `owner`
- 自关联父级字段统一使用 `parent`，不要使用 `parent_id`、`pid`。
- 普通 Directus 关系字段优先保持语义化名称，不强制添加 `_id`。
- 仅当字段是底层技术外键、不会作为 Directus 关系字段展示时，才考虑使用 `_id` 后缀。
- 一对多虚拟字段不应作为真实数据库列写入 DBML。

### 多对多关联表

- 多对多关系必须使用独立关联表。
- 关联表命名优先采用 `{table_a}_{table_b}`，例如：
  ```text
  articles_categories
  ```
- 关联表至少包含：
  ```dbml
  id integer [pk, increment]
  article uuid [not null, ref: > articles.id]
  category uuid [not null, ref: > categories.id]
  sort integer
  ```
- 两侧关联字段使用单数实体名。
- 应为关系字段组合添加唯一约束，防止重复关系：
  ```dbml
  indexes {
    (article, category) [unique]
  }
  ```
- 需要维护关系顺序时添加 `sort` 字段。

### 文件字段

- 关联 Directus 文件库的单文件字段使用明确的单数名称，例如：
  - `image`
  - `cover`
  - `avatar`
  - `document`
- 文件字段关联 `directus_files.id`：
  ```dbml
  cover uuid [ref: > directus_files.id]
  ```
- 多文件字段必须通过关联表实现，不使用 JSON 数组保存文件 ID。

### 树形与层级数据

- 父级关系字段统一命名为 `parent`。
- 同级手动排序统一使用 `sort`。
- 可读路径可使用 `slug`。
- 不同时使用 `parent`、`parent_id`、`pid` 表示同一关系。

### 常用字段建议

- URL 友好标识：`slug`
- 标题：`title`
- 简短名称：`name`
- 摘要：`summary`
- 正文：`content`
- 描述：`description`
- 外部 URL：`external_url`
- 邮箱：`email`
- 电话：`phone`
- JSON 扩展数据：`metadata`
- 版本号：`version`
- 乐观锁字段：`revision`

### 索引与约束

- `slug`、业务编码等唯一标识应添加唯一约束。
- 所有真实外键字段都应定义 `ref`。
- 高频查询的状态、时间和外键字段应根据查询场景添加索引。
- 必填字段使用 `[not null]`。
- 业务唯一性应通过数据库唯一约束表达，不能只依赖应用层校验。
- 外键删除行为必须根据业务明确设计，避免默认级联删除重要内容。

### 注释要求

- 表和字段含义不直观时，必须添加 DBML `note`。
- 枚举字段必须在注释中列出允许值及含义。
- 关系字段应说明删除行为或生命周期约束。
- 注释描述业务含义，不重复字段名称。

### 标准业务表模板

```dbml
Table articles {
  id uuid [pk]
  status varchar(32) [not null, default: 'draft']
  sort integer

  title varchar(255) [not null]
  slug varchar(255) [not null, unique]
  summary text
  content text

  cover uuid [ref: > directus_files.id]
  category uuid [ref: > categories.id]
  user_owner uuid [ref: > directus_users.id]

  date_published timestamp
  user_created uuid [ref: > directus_users.id]
  date_created timestamp [not null]
  user_updated uuid [ref: > directus_users.id]
  date_updated timestamp

  indexes {
    status
    category
    date_published
  }
}
```

### 生成前检查

生成 DBML 前必须确认：

1. 是否误用了 `directus_` 前缀。
2. 是否使用了 `created_at`、`updated_at` 等非 Directus 审计字段。
3. 时间字段是否使用 `date_` 前缀。
4. 用户关系字段是否使用 `user_` 前缀。
5. 手动排序字段是否命名为 `sort`。
6. 状态字段是否统一为 `status`。
7. 外键是否定义了 `ref`。
8. 多对多关系是否使用了关联表。
9. 是否存在重复、模糊或语义冲突的字段。
10. 是否为唯一业务标识添加了唯一约束。

特别注意：`directus_` 只保留给 Directus 核心系统表。项目自己的系统配置表也不得使用该前缀，以免升级 Directus 时发生冲突。

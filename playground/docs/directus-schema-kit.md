# Directus Schema Kit AI 规则

本文件由 `dsk init` 生成，用于约束 Codex/AI 在当前 Directus 项目中编写 DSK schema。

## 开始前必须阅读

1. 当前项目的 `AGENTS.md` 与 `docs/` 规则文档。
2. 当前项目的 `dsk/README.md`。
3. 当前项目已有的 `dsk/schemas/`、`dsk/resources/` 和 `dsk/seeds/`。
4. DSK 公开文档中的 Schema DSL、Manifest 和 CLI 说明。

## 必须遵守

- 只从 `@deeptimes/directus-schema-kit` 导入公开 API。
- 不手写、不编辑 `dsk/generated/manifest.json`。
- 文件名只用于组织源码，不代表 Directus namespace。
- collection 名在整个项目中全局唯一。
- 一个 collection 只能在一个文件中完整定义。
- 关系优先使用 `relation.*` blueprint。
- `field.audit()` 在 `fields` 数组中必须写作 `...field.audit()`。
- `plan`、`apply` 和 `clear` 始终基于完整 Manifest，不按文件局部执行。
- 普通 `apply` 不做删除、字段类型迁移、collection 重命名或存量数据迁移。

## 命名约定

- collection 和 field 使用小写 `snake_case`。
- 业务 collection 默认使用复数名，例如 `articles`、`products`。
- 业务 collection 禁止使用 `directus_` 前缀。
- 主键使用 `id`。
- 内容状态字段使用 `status`。
- 手动排序字段使用 `sort`。
- 审计字段使用 `...field.audit()`。
- 业务时间字段使用 `date_` 前缀。
- 用户关系字段使用 `user_` 前缀。
- 布尔字段使用 `is_` 前缀。

## 禁止

- 发明 DSK 未公开的 helper、字段类型或导入路径。
- 把 Directus interface/display/special 当成数据库类型。
- 声明或修改 `directus_*` 系统 collection。
- 用 `created_at`、`updated_at`、`created_by`、`updated_by` 替代 Directus 标准审计字段。
- 用 JSON 数组保存文件 ID 或多用户 ID。
- 硬编码 Directus role、policy、user 等系统资源 UUID。
- 声明 Flow、Operation、Dashboard、Panel，当前版本不支持。

## Directus 11 / 12 兼容与开发边界

- 使用 Node.js 22+；自动集成基线为 Directus 11.17.4 / 12.5.1 + SQLite，不能把版本准入等同于所有数据库和 Studio 行为已认证。
- DSK 通过 Directus API 工作；连接配置使用项目环境中的 `PUBLIC_URL`、`ADMIN_TOKEN`，仅用于本地或私网开发实例。
- v12 自定义权限过滤、字段限制、validation 和 presets 依赖 `custom_permission_rules_enabled`。资源同步（包括 dry-run）会检查实际服务许可；未启用或查询失败时停止，不得删除规则绕过限制。
- 无自定义规则的全字段 permission 应明确声明 `fields: ['*']`；不要把缺省 fields 当作不受许可限制。
- 自定义系统资源使用稳定 key 与 `ref()`；Public permission 使用 `systemRef('policies.public')`，不重复创建内置 Public policy。
- `field.boolean()` / `field.toggle()` 默认生成 `special: ['cast-boolean']`，保证 SQLite API 返回布尔值。已有字段若因此出现 dangerous，需审查并独立变更，不能自动绕过 Plan。
- `dateTime` 表示不带时区的日期时间，Seed 使用 `YYYY-MM-DDTHH:mm:ss`；跨时区绝对时间使用 timestamp。
- v12 Studio 新集合默认 Archived 不影响显式声明的字符串 `status`；不要自动将已有状态字段改为布尔类型。
- Markdown helper 不依赖 TinyMCE；自定义 WYSIWYG interface/options 时，需单独核对 v12 Tiptap 配置与内容兼容性。
- Seed 使用自然键和稳定业务键引用；计划可引用更早出现的新增项。`__dsk_seed_plan__:` 只是计划内占位 ID，不写入源码或当作真实 ID。
- 升级 Directus 时先备份，再由 Directus bootstrap 执行系统迁移；不使用 DSK clear 代替版本迁移。
- 系统资源删除必须显式声明 `delete: true` 并提供 `--confirm-destructive`；clear 先审查完整范围，再交互确认或显式 `--confirm`，永远保护 `directus_*`。
- 凭证、secret 和真实隐私数据不进入源码、Manifest、Seed 或报告；敏感定义使用 `env()` 引用。

## 修改后检查

```bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
```

涉及系统资源时先运行 `pnpm dsk resources apply --dry-run`；涉及 Seed 时先运行 `pnpm dsk seed --plan`。只有任务明确授权目标实例写入，并完成计划审查后，才执行真实 apply、resources apply、seed 或 clear。Schema apply 失败后先核对部分结果并重新 plan，不假设有事务回滚。

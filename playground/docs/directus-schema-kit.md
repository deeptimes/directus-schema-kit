# Directus Schema Kit 项目开发指南与 AI 规则

本文件由 `dsk init` 生成，供项目开发者与 Codex/AI 查阅常用命令、执行边界和 Schema 编写规则。已有文件不会被 init 覆盖，升级后需手动合并新增说明。

## CLI 快速参考

在 Directus 项目根目录执行；连接实例需配置 `PUBLIC_URL` 和管理员的 `ADMIN_TOKEN`。

| 命令 | 用途与写入行为 |
| --- | --- |
| `pnpm dsk init [--dry-run]` | 创建缺失的工作区文件；保留已有文件；dry-run 不写入 |
| `pnpm dsk doctor` | 检查项目识别、配置和环境变量 |
| `pnpm dsk build [--check]` | 根据源码生成 Manifest；check 仅检查是否最新 |
| `pnpm dsk validate` | 离线检查定义、Manifest 新鲜度和 Seed |
| `pnpm dsk plan` | 只读比较代码声明与实例，查看待创建、更新和冲突项 |
| `pnpm dsk apply [--dry-run]` | 应用安全的结构创建／更新；dry-run 只预览；conflict/dangerous 全量阻断 |
| `pnpm dsk seed [path] [--dry-run] [--plan]` | 默认写入基础数据；dry-run 仅离线校验，plan 连接实例预览；两者互斥 |
| `pnpm dsk resources apply [--dry-run] [--confirm-destructive]` | 同步角色、策略、授权、权限、目录和预设；显式 delete 定义还需 confirm-destructive |
| `pnpm dsk clean [--dry-run] [--confirm] [--admin-user <id>]` | 清空全部自定义集合记录，保留结构、用户、权限和文件 |
| `pnpm dsk reset [--dry-run] [--confirm] [--admin-user <id>]` | 完整清理业务环境，包括旧集合、普通用户、业务权限和上传文件 |
| `pnpm dsk clear [--dry-run] [--confirm]` | 兼容旧行为：只删除代码声明的自定义集合结构和数据 |

Manifest 是 `build` 根据代码生成的执行清单，不需要手工维护。`clean`／`reset` 会检查实例中的全部自定义集合，包括已经从代码中移除的旧集合。

日常修改后先运行 `build` → `validate` → `plan`，审查后再 `apply`。基础数据与系统资源分别通过 seed 和 resources 命令处理，不会随 Schema apply 自动执行。

全局参数放在子命令前，例如 `pnpm dsk --cwd /path/to/project --format json plan`；可用 `--config <path>` 指定项目配置文件。任意命令可加 `--help` 查看参数。

### 清理前须知

```bash
pnpm dsk clean --dry-run   # 预览清空业务记录
pnpm dsk reset --dry-run   # 预览完整清理，包含实际上传文件
pnpm dsk reset             # 展示计划后确认，默认拒绝
```

- 真实清理必须确认：交互输入 y，脚本添加 `--confirm`；`--dry-run` 与 `--confirm` 互斥。JSON／非交互模式未确认时仅返回计划。
- 保留 settings、初始管理员账号密码及其授权链、系统 Public policy，以及 License 和运行配置。初始管理员通过 `ADMIN_EMAIL` 或 `--admin-user <id>` 识别；当前认证管理员始终保留。未指定初始管理员时，应使用该账号的 ADMIN_TOKEN。
- settings、保留管理员或其他保留资源引用待删对象时，执行前阻断并说明；不会置空这些引用来绕过保护。reset 通过 Files API 删除已登记上传文件及实际存储，无法检查未登记的孤立存储对象。
- 确认后重读检查计划变化；执行首项失败即停止并报告已完成项，不承诺事务回滚；完成后验证保留配置和管理员授权，重复执行安全。`safety.clearEnabled: false` 禁用清理。
- 新清理路径已在 Directus 12.5.1 + SQLite 验收；11.x 尚待真实实例验收。无法完整预检的引用、权限或 deployment 子项会阻断，不能把部分清理当成成功。

完整参数、退出码、JSON 契约和限制见安装包内的 [CLI 参考](../node_modules/@deeptimes/directus-schema-kit/docs/cli-reference.md)；包文档位于 `node_modules/@deeptimes/directus-schema-kit/docs/`。本文件提供项目内常用说明，完整 CLI 参考随安装版本维护。

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

## 集合可见性与呈现层级

创建或修改 collection 时，必须根据实际维护方式、集合名称和业务归属，显式检查可见性与层级，不留到创建后在 Data Studio 中手动拖拽整理。

### 后端维护的集合隐藏

- 已知由后端服务负责 CRUD，且无需人工在 Data Studio 中填写、查看或管理的 collection，必须设置集合级 `meta.hidden: true`，例如内部认证挑战、任务执行记录或技术关联数据。
- 不能仅因集合由后端写入就隐藏；仍需人工查看、审核或管理的集合应保持可见。用途不明确时，先结合业务需求和已有实现判断，不凭名称直接隐藏。
- 隐藏只控制 Data Studio 的呈现，不代替 API 权限控制，也不改变集合的数据关系。
- 当前 `collection()` 没有 `hidden` 参数；应在源码中对其返回的定义设置 `meta.hidden`，不得发明参数或手改 Manifest。例如：

```ts
const authChallenges = collection({ name: 'auth_challenges', label: '认证挑战' })
authChallenges.meta.hidden = true
```

### 按业务归属设置层级

- 根据集合名识别主集合与附属集合，兼顾单复数形式和业务含义。明确属于同一业务且已有主集合时，附属集合必须通过 `collection({ group: '主集合名', ... })` 归入其下一层，对应 Directus 的 `meta.group`。
- 例如 `blog_tags` 归入 `blogs`；`article_categories`、`article_contexts` 归入 `articles`；`chart_houses`、`chart_positions` 归入 `charts`；`profile_tags`、`profile_tag_links` 归入 `profiles`。
- 名称是判断线索，业务归属优先；独立业务集合或跨模块共享集合不应仅因前缀相似而强行嵌套。多个候选父集合时，结合用途确定直接归属，不能确定时再确认。
- 父集合必须存在于完整 Schema 中；不得引用自身或形成循环，也不要仅为匹配名称创建无业务需要的集合或额外的 `collectionGroup()`。
- 层级只组织 Data Studio 的集合导航，不表示数据库外键、数据从属关系或 namespace，也不改变 collection 的全局名称。
- 可见性与层级分别判断：人工维护的附属集合仍可见；隐藏的附属集合仍应设置正确归属。自动 junction 沿用 blueprint 默认的隐藏和来源集合分组，不覆盖为按名称猜测的分组。

```ts
const blogs = collection({ name: 'blogs', label: '博客' })
const blogTags = collection({ name: 'blog_tags', label: '博客标签', group: 'blogs' })
```

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
- resources apply 删除必须显式声明 `delete: true` 并提供 `--confirm-destructive`；clear 先审查完整范围，再交互确认或显式 `--confirm`，永远保护系统集合结构。
- `clean --dry-run` 预览清空全部自定义集合记录；`reset --dry-run` 预览完整清理，包含旧集合、普通用户、业务权限和实际上传文件。真实执行先审查完整计划，再交互确认或显式 `--confirm`。保留 settings、初始管理员及其授权链和 License 配置，不调用 bootstrap；初始管理员通过 ADMIN_EMAIL 或 `--admin-user <id>` 指定，当前认证管理员始终保留。保留资源引用待删对象时阻断，不置空引用绕过。
- 凭证、secret 和真实隐私数据不进入源码、Manifest、Seed 或报告；敏感定义使用 `env()` 引用。

## 修改后检查

```bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
```

涉及系统资源时先运行 `pnpm dsk resources apply --dry-run`；涉及 Seed 时先运行 `pnpm dsk seed --plan`。只有任务明确授权目标实例写入，并完成计划审查后，才执行真实 apply、resources apply、seed、clear、clean 或 reset。Schema apply 失败后先核对部分结果并重新 plan，不假设有事务回滚。

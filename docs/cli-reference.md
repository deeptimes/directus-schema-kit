# CLI 参考

## 全局参数

全局参数写在子命令前：

```bash
pnpm dsk [--cwd <path>] [--config <path>] [--format text|json] <command>
```

| 参数 | 说明 |
| --- | --- |
| `--cwd <path>` | Directus 项目或其子目录，默认当前目录 |
| `--config <path>` | 相对项目根目录的配置文件，默认 `dsk/config.json` |
| `--format text\|json` | 人工可读或机器可读输出，默认 `text` |
| `--version` | 输出安装的包版本 |

## 命令

| 命令 | 作用 | 是否连接实例 | 是否写入 |
| --- | --- | --- | --- |
| `init [--dry-run]` | 幂等初始化 `dsk/` 工作区 | 否 | 创建缺失文件 |
| `build [--check]` | 编译 DSL，生成或检查 Manifest | 否 | 默认写 Manifest |
| `validate` | 校验配置、Manifest、新鲜度和 seed | 否 | 否 |
| `doctor` | 诊断项目、版本、环境变量和工作区 | 否 | 否 |
| `plan` | 比较 Manifest 与 Directus 当前状态 | 是，只读 | 否 |
| `apply [--dry-run]` | 执行安全的 Schema 创建和更新 | 是 | 默认写入 |
| `seed [path] [--dry-run\|--plan]` | 校验、规划或幂等应用 seed | `--dry-run` 否，其余是 | 默认写入 |
| `resources apply [--dry-run] [--confirm-destructive]` | 同步系统资源 | 是 | 默认写入 |
| `clear [--dry-run] [--confirm]` | 仅清理代码声明的自定义 Schema | 是 | 需交互确认或 `--confirm` |
| `clean [--dry-run] [--confirm] [--admin-user <id>]` | 清空实例全部自定义集合记录，保留结构和配置 | 是 | 需交互确认或 `--confirm` |
| `reset [--dry-run] [--confirm] [--admin-user <id>]` | 完整清理开发业务环境，含上传文件 | 是 | 需交互确认或 `--confirm` |

`build --check` 只检查现有 Manifest 是否最新。`seed --dry-run` 仅做本地结构校验；要查看实例上的 create/update/unchanged，使用 `seed --plan`。

## 开发环境清理

```bash
pnpm dsk clean --dry-run       # 清空业务记录的预览
pnpm dsk reset --dry-run       # 完整清理的预览
pnpm dsk reset                 # 展示计划后 y/N 确认，默认拒绝
pnpm dsk reset --confirm       # 脚本中明确授权完整删除
```

- `clean` 删除实例中全部自定义集合的记录，包括未在代码中声明的集合；保留集合、字段、关系、用户、权限、文件和文件夹。业务记录间可空引用先置空，非空引用按依赖删除；无法安全处理的非空循环在写入前阻断。
- `reset` 删除全部自定义集合及数据、非保留用户、业务 roles/policies/access/permissions、presets、上传文件和文件夹。通过 Directus Files API 删除实际存储文件及缩略图，不直接遍历或删除上传目录。API 无法检查没有文件记录的孤立存储对象。
- 两者保留 `directus_settings` 全部配置及管理员账号、密码与完整授权链；reset 也保留系统 Public policy 和其 Public 授权关联。Public／管理员 policy 中针对目标业务集合的 permissions 删除，其他 permissions 保留。
- 当前认证管理员始终保留。初始管理员优先通过 `.env` 的 `ADMIN_EMAIL` 定位；可用 `--admin-user <id>` 明确指定额外保留的初始管理员。未提供二者时，使用当前认证管理员，**应使用初始管理员的 ADMIN_TOKEN**；API 没有标记哪个用户是创建实例时的管理员。保留账号必须激活且具备有效管理员授权。
- License、环境配置和系统表保持原样；不运行 bootstrap、不删除数据库文件、不重新创建管理员。
- settings、保留管理员（例如头像）或其他保留资源引用待删文件、文件夹、角色或策略时，全量阻断并列出引用源。不会通过级联删除或置空这些引用绕过；需自行决定如何调整引用后重新预览。
- 计划标注代码声明项与实例未声明项，并列出集合记录数、字段、关系、资源 ID 和保留项。两条命令都覆盖整个实例的自定义部分，不能按文件局部执行。
- `--dry-run` 与 `--confirm` 互斥。JSON／非交互且无 `--confirm` 时只返回计划；`safety.clearEnabled: false` 禁用清理。
- 确认后重读实例，已知引用冲突或计划变化在写入前阻断。执行首项失败即停止，报告已完成项；不承诺事务回滚，也不能排除执行中的并发修改。运行期间应暂停其他业务写入。
- 无法完整枚举权限（例如许可过滤）、未知系统引用、不可解除的主键外键循环或 singleton 底层存在多条隐藏记录时拒绝清理。Directus 12 已配置 deployment 时，子项 API 带同步副作用，reset 会阻断并要求先处理；不通过带写入副作用的 GET 完成 dry-run。用户会话、OAuth 授权及审计／通知记录按 Directus 内置用户生命周期处理。
- 执行后重读并验证 settings、保留用户和管理员授权未变且无剩余清理目标；clean 额外验证结构和全部资源配置未变。重复执行安全。

`clear` 的旧行为保持不变：仅删除完整 Manifest 声明的自定义 Schema 及数据，不清理用户、权限或文件；不会覆盖未声明的旧集合。

## 推荐工作流

```bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk plan
```

最后一次 `plan` 应没有可执行差异。CI 通常使用：

```bash
pnpm dsk build --check
pnpm dsk --format json validate
```

全局参数示例：`pnpm dsk --format json validate`。

## Plan 分类

| 分类 | 含义 | Apply 行为 |
| --- | --- | --- |
| `create` | 目标资源不存在 | 执行 |
| `update` | 仅包含安全白名单差异 | 执行 |
| `unchanged` | 已声明属性一致 | 跳过 |
| `conflict` | 存在非白名单差异 | 阻断全部写入 |
| `dangerous` | 类型、约束、关系目标或删除策略等高风险差异 | 阻断全部写入 |

`meta.conditions` 属于字段安全更新白名单，Plan 展示条件数组差异；涉及隐藏时保存清空时附带后续数据影响提示。未声明时保留，`null` / `[]` 表示清空。

`resources apply` 支持 Translation Strings，按翻译键和语言认领、更新或显式删除。翻译操作的 `changes` 在文本和 JSON 报告中展示；失败结果包含 `completed`、`failure` 和后续 `notExecuted`，首项失败即停止，无整体事务回滚。`--dry-run` 只读，显式删除沿用 `--confirm-destructive`。用法见 [Translation Strings](./schema-dsl.md#translation-strings)。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功，且没有阻断差异 |
| `2` | DSL 构建、Manifest 或数据校验失败 |
| `3` | 存在 conflict/dangerous，或操作缺少危险确认 |
| `4` | 连接、执行或清理后验证失败 |
| `5` | 配置或项目识别错误 |

Directus v12 的受限权限声明在 `resources apply`（含 dry-run）前检查许可；缺少能力或认证配置时不写入。`seed --plan` 中的 `__dsk_seed_plan__:` ID 是计划占位，不能作为实例 ID 使用。

JSON 输出只在 stdout 产生一个机器可读结果，不包含装饰性文本或凭证。

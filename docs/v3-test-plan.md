# v3 测试计划

本文定义 v3.0 的验证方式。目标是把每类 Directus 系统模型资源逐项跑通，并留下可在 `playground` 复现的证据；它不是 [DSK 实现与验收](./development.md) 的替代，常规单元和集成回归仍然适用。

## 1. 测试环境

### 本地矩阵

- 项目：`playground/`
- Directus：12.5.1 + SQLite
- 命令：`pnpm dsk ...`
- 用途：Schema、资源、Seed、清理和本地安全边界；先 `build`、`validate`、`plan`，再 `apply`。
- 每轮开始前用 `pnpm dsk reset --confirm` 恢复，或重建一次性 SQLite 实例。

### 跨环境矩阵

- dev 与 target 两个**一次性** Directus 实例，版本（含 patch）和数据库 vendor 完全一致。
- 建议 dev 使用 playground 的 8055，target 使用独立端口和独立 SQLite 文件；测试后销毁。
- `d6s profile add dev ...`、`d6s profile add target ...`；凭证只放本地环境变量或 credential store，不提交。
- 不使用 staging / production 地址或凭证。
- 每轮开始前重建 target，避免上一轮资源残留影响 `id_map` 和匹配结果。

### 测试数据

- 在 `playground/dsk/resources/` 增加或使用最小 fixture：settings、translations、folders、presets、roles、policies、access、permissions。
- 角色 / 策略名称使用唯一前缀，例如 `V3-<场景>-<序号>`，避免和已有 playground 数据碰撞。
- 不写入真实隐私数据、token、密码或生产文件。

## 2. 本地资源矩阵

| 编号 | 资源 / 主题 | 场景 | 预期 |
| --- | --- | --- | --- |
| L-SET-1 | settings | 声明 `project_name`、`default_language`、`default_timezone`、`project_color` | 首次 apply 写入；只更新声明字段；未声明字段保持原值 |
| L-SET-2 | settings | 修改单个字段后再 apply | 只更新该字段；第二次 apply `unchanged` |
| L-SET-3 | settings | 环境本地 / 敏感字段（License、AI、存储、邮件、品牌图片） | 不进入 Manifest；不被 DSK 写入；reset 后仍保留 |
| L-FLD-1 | folders | 创建 media folder 根目录和子目录 | `name + parent + type` 正确；第二次 apply `unchanged` |
| L-FLD-2 | folders | 同名的 media folder 和 flow folder | `type` 参与匹配，不误认领、不冲突 |
| L-FLD-3 | folders | 重命名、移动父级 | 更新目标记录；不删除旧文件引用 |
| L-FLD-4 | folders | 删除带文件的 folder | 文件引用存在时阻断；无引用时需 `delete: true` + `--confirm-destructive` |
| L-PRE-1 | presets | global tabular preset：fields、widths、bookmark | 创建并回读；第二次 apply `unchanged` |
| L-PRE-2 | presets | role preset：绑定 role | role 引用解析正确；role 重命名后仍能匹配 |
| L-PRE-3 | presets | personal preset / user 维度 | 明确标记为环境本地；不进入跨环境发布范围 |
| L-TRA-1 | translations | 多语言 `key + language` | 新增、更新、空文字、Unicode 正确；第二次 apply `unchanged` |
| L-TRA-2 | translations | 超过 100 条分页 | 分页完整；不丢记录；重复执行收敛 |
| L-TRA-3 | translations | 显式删除 | 需确认；不存在时 `unchanged`；不删除共享翻译 |
| L-ROL-1 | roles | 创建、更新、重命名 | 稳定键认领；第二次 apply `unchanged` |
| L-ROL-2 | roles | 同名角色 | 匹配不唯一时冲突阻断 |
| L-POL-1 | policies | 创建、更新、重命名；`admin_access` | 写入正确；`admin_access: true` 在 Plan 中明确提示审查 |
| L-POL-2 | policies | Public policy | `systemRef('policies.public')` 只关联，不创建 / 删除系统 policy |
| L-ACC-1 | access | `role + policy + user: null` | 创建并回读；重复执行收敛 |
| L-ACC-2 | access | user-scoped access | 明确标记为环境本地；跨环境发布时排除或阻断 |
| L-PER-1 | permissions | `policy + collection + action`；fields、permissions、validation、presets | 创建、更新、回读正确；重复执行收敛 |
| L-PER-2 | permissions | 自定义权限规则许可未启用 | 在写入前报配置错误；不移除规则绕过 |
| L-SAFE-1 | 安全 | `localhost`、`10.x`、`192.168.x`、`.local` | 允许连接；`doctor` 显示命中规则 |
| L-SAFE-2 | 安全 | `172.x`、公网地址、`environment` 非 `development` | 在任何写入前拒绝；`doctor` / `plan` 同样拒绝 |
| L-MAN-1 | Manifest | 确定性 build、`build --check`、过期 Manifest | 字节级稳定；过期时执行层拒绝 |
| L-MAN-2 | Manifest | 日志和报告脱敏 | 不出现 token、密码、真实隐私数据 |

## 3. 跨环境 d6s 矩阵

| 编号 | 场景 | 命令 / 操作 | 预期 |
| --- | --- | --- | --- |
| C-SCOPE-1 | 只同步权限链，不动 Schema | `d6s sync pull --from dev --no-schema --roles` | 只更新 roles / policies / access / permissions 文件；Schema 文件不变 |
| C-SCOPE-2 | Schema 指定集合 + 权限链 | `d6s sync pull --from dev --collections pages,posts --roles` | 只覆盖指定集合的 Schema；配置范围按 `--roles` |
| C-SCOPE-3 | 排除 flows / operations | `d6s sync pull --from dev --no-flows` | flows / operations 不更新；folders 仍按默认同步 |
| C-SCOPE-4 | 同时排除 flows / folders | `d6s sync pull --from dev --no-flows --no-folders` | flows / operations / folders 都不更新；不因依赖被拒绝 |
| C-SCOPE-5 | project 配置固定范围 | `directus.config.json` 的 `resources` / `excludeResources` | 使用项目范围；命令行 flags 覆盖项目配置 |
| C-REL-1 | 首次 push | `diff` → `push --mode merge` | 只新增和更新；不删除目标记录 |
| C-REL-2 | 重复 push | 再次 `diff` → `push` | 报告无变化；不重复创建 |
| C-REL-3 | id_map | 首次 push 后检查 `directus/default/id_map.json` | 记录 source / target 映射；提交后后续 push 复用 |
| C-REL-4 | 目标已有同名记录 | 首次 push 遇到一个 / 多个匹配 | 一个匹配可直接映射；多个匹配要求人工选择，非交互拒绝 |
| C-REL-5 | 角色名契约 | dev 改名 → `diff` → `push` | diff 显示差异；push 让目标名称收敛到 dev |
| C-REL-6 | 目标侧改名 | 在 target 改 role name → `pull --from target` | 客户名称进入发布文件，造成源污染；验证这是 drift 而非自动映射 |
| C-REL-7 | mirror 门禁 | 非交互 `mirror` 未带 `--dangerously-allow-delete` | 在写入前拒绝 |
| C-REL-8 | 版本 / vendor 不一致 | 不同 patch 或不同 DB vendor | `diff` / `push` 阻断；`--allow-drift` 只作为显式例外 |
| C-REL-9 | 内容 / 用户边界 | d6s 默认 pull / push | 业务内容、文件内容、用户默认不同步；user grant 不删除目标已有授权 |

## 4. 通过标准

- 本地矩阵每项在第二次执行时收敛为 `unchanged`，除非场景明确要求 create / update / delete。
- 跨环境矩阵不产生重复记录；`id_map.json` 提交后重复 push 稳定。
- 所有失败都在写入前阻断；危险操作有独立确认；日志和报告不含凭证。
- 测试证据记录命令、实例版本、数据库 vendor、预期和实际结果；失败项单独开 issue，不静默跳过。
- 只有本地矩阵和跨环境矩阵都通过，v3.0 的资源覆盖才算完成。

## 5. 建议的记录方式

- API 层优先使用自动化 integration test；Studio 的文件夹、书签、settings、翻译和管理员体验仍需人工验收。
- 命令输出使用 `dsk --format json` / `d6s --json` 保存为证据；文件放在临时目录，不提交真实 token。
- 每轮结束记录：Directus 版本、DB vendor、DSK 版本、d6s 版本、playground 提交、通过 / 失败项。

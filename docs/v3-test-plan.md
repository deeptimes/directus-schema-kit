# v3 测试计划

本文定义 v3.0 的验证方式。目标是把每类 Directus 系统模型资源逐项跑通，并留下可在 `playground` 复现的证据；它不是 [DSK 实现与验收](./development.md) 的替代，常规单元和集成回归仍然适用。

## 1. 测试环境

### 本地矩阵

- 项目：`playground/`
- Directus：12.7.0 + SQLite（12.6.1 回退候选）
- 命令：`pnpm dsk ...`
- 用途：Schema、资源、Seed、清理和本地安全边界；先 `build`、`validate`、`plan`，再 `apply`。
- 每轮开始前用 `pnpm dsk reset --confirm` 恢复，或重建一次性 SQLite 实例。

### 跨环境矩阵

- dev 与 target 两个**一次性** Directus 实例，版本（含 patch）和数据库 vendor 完全一致。
- 建议 dev 使用 playground 的 8055，target 使用独立端口和独立 SQLite 文件；测试后销毁。
- `d6s profile add dev ...`、`d6s profile add target ...`；凭证只放本地环境变量或 credential store，不提交。
- 不使用 staging / production 地址或凭证。
- 每轮开始前重建 target，避免上一轮资源残留影响 `id_map` 和匹配结果。

### 建议的项目结构

- **不**把 `playground/` 拆成多个完整的 Directus 子项目。那会复制 package、lockfile、数据库和上传目录，维护成本高，也容易让测试和示例互相污染。
- 保持 `playground/` 单项目作为 dev；target 用**一次性第二实例**：独立 SQLite 文件、独立 uploads、端口 8056，测试后销毁。
- 已提供 `playground/scripts/create-v3-copy.mjs`（`pnpm v3:copy`），生成 `playground/.v3-runtime`：Directus 12.7.0、端口 8056、独立 DB / uploads / admin token；现有 playground 不受影响。生成后执行 `pnpm install && pnpm bootstrap`，再用 `pnpm dev:v3` 启动。
- 如果以后需要长期稳定地同时跑 dev / staging / target，再考虑 `docker compose` 两个同版本 Directus 服务；不要用多个提交的子项目模拟环境。
- 场景隔离用 `dsk reset` 或临时项目副本；不要把多套 Directus 运行时提交进仓库。
- v3 使用一次性副本升级到 12.7.0；`playground/package.json` 的 12.5.1 保持不动，避免影响现有数据库和 uploads。12.6.1 只在 12.7.0 出现兼容问题时回退。

`@directus/cli` 是独立包，当前 latest 12.5.1；d6s 的 CLI 版本和 Directus 服务器版本不是同一个版本号。

### 当前可用实例（本地，未提交）

- `playground/.v3-runtime`：Directus 12.7.0，端口 8056；`pnpm dev:v3` 启动。凭证见该目录 `.env`。
- `playground/.v3-target`：Directus 12.7.0，端口 8057；`pnpm start` 启动。用于 d6s 跨环境对比。
- `playground/.v3-runtime/.settings-test`：settings / folders / translations / roles / policies / access / permissions / preset 的 DSK 测试项目，连接 8056；命令：
  ```bash
  node dist/cli.js --cwd playground/.v3-runtime/.settings-test build
  node dist/cli.js --cwd playground/.v3-runtime/.settings-test validate
  node dist/cli.js --cwd playground/.v3-runtime/.settings-test resources apply --dry-run
  node dist/cli.js --cwd playground/.v3-runtime/.settings-test resources apply
  ```

### 测试数据

- 在 `playground/dsk/resources/` 增加或使用最小 fixture：settings、translations、folders、presets、roles、policies、access、permissions。
- 角色 / 策略名称使用唯一前缀，例如 `V3-<场景>-<序号>`，避免和已有 playground 数据碰撞。
- 不写入真实隐私数据、token、密码或生产文件。

## 2. 本地资源矩阵

| 编号 | 资源 / 主题 | 场景 | 预期 |
| --- | --- | --- | --- |
| L-SET-1 | settings | 声明 `project_name`、`default_language`、`project_color` | 首次 apply 写入；只更新声明字段；未声明字段保持原值 |
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

## 5. 当前结果（2026-11-20）

- 本地 Directus 12.7.0 + SQLite：schema apply 131 ops / 二次 plan unchanged；seed 10 create / 二次 unchanged；settings PATCH 收敛；folders `files` / `flows` 同名创建并收敛；translations create / update / delete 收敛；roles / policies / access / permissions 简单链创建并收敛；presets 创建并收敛。
- 跨环境 `@directus/cli@12.5.1`：dev 8056 → target 8057，使用 `collections: v3_articles` + `roles` / `folders` / `presets` / `translations` / `settings` 完成 pull / diff / push；target schema 与配置创建成功；二次 diff 14 条 `unchanged`；`id_map.json` 生成；非交互 `mirror` 无 consent 被拒绝；target role name 直接修改后 diff 显示，push 恢复 dev 名称。
- 尚未执行：有 license 的自定义权限、>100 条翻译的真实 12.7.0 分页、Data Studio 交互回归；Flows / Dashboards 不在 v3.0 范围。

### 人工验收（P0）

- [ ] **Studio 基础**：打开 8056，确认 Directus 12.7.0；检查 blog collection / field / relation、Markdown / Tags / Code / Toggle、文件上传与 folder 选择；有字段条件时检查动态显示。
- [ ] **Settings**：Settings 页确认 project name、default language、color；在 Studio 改一个未声明的 settings 字段，再运行 `.settings-test resources apply --dry-run`，确认 DSK 不碰该字段、声明字段 unchanged。
- [ ] **Folders**：File Library 和 Flows 各有一个 `V3 Shared`，类型分别为 files / flows；重命名或移动其中一个，dry-run 出现差异，apply 恢复。
- [ ] **Bookmark**：打开 `v3_articles`，确认 `V3 Preset` tabular 视图的字段和宽度；创建一个 personal bookmark，确认它不会进入 d6s pull。
- [ ] **Translations**：在 Translation Strings 查看 `v3.hello`；如果字段使用了 `$t:v3.hello`，切换 zh-CN / en-US 检查显示。
- [ ] **简单权限**：创建用户并分配 `V3 Editor`，确认能读 `v3_articles`、不能写；管理员仍可管理。
- [ ] **d6s 目标**：打开 8057，确认 schema、settings、folders、translation、V3 Editor role / policy、preset；运行 `d6s sync diff --to target --json` 应为 `changes: false`；非交互 mirror 应被拒绝；在 Studio 改 target role name 后 diff 显示差异，push 恢复 dev 名称。
- [ ] **License 自定义权限**：在 `.v3-runtime/.env` 配置 `LICENSE_KEY` 并重启，使用带过滤、字段限制、validation、presets 的项目验证 Studio 实际行为。
- [ ] **硬保护抽查**：`dsk doctor` 对 8056 应 pass 并显示 `127.0.0.0/8`；临时把 `PUBLIC_URL` 改为 `http://8.8.8.8:8055`，`plan` 应在 HTTP 请求前失败；恢复后正常。

## 7. 待验收清单

以下项目尚未完成，按用户逐个配合的节奏执行：

- [ ] 有 license 的 Directus 实例：自定义权限过滤、字段限制、validation、presets 和 Studio 实际效果。
- [ ] Directus 12.7.0 真实实例的 >100 条 Translation Strings 分页、更新和删除。
- [ ] Data Studio 人工回归：Markdown / Tags / Code / Toggle、八类关系、文件上传、字段条件、settings、folders、书签和翻译切换。
- [ ] d6s 扩展矩阵：多 collection、部分 Schema、mirror 实际删除、版本 / vendor 不一致、incomplete pull、多 target id_map、首次接入生产基线。
- [ ] Personal preset 在真实 d6s pull 中不出现（只作为环境本地资源）。
- [ ] Flows / Operations / Dashboards / Panels：v3.x 独立设计，不在 v3.0。
- [ ] Users / 内容 / 文件数据同步：非目标；需要时独立设计。
- [ ] 等 `@directus/schema` 14.0.3 / 15.x 或 Directus 12.8 发布后重新核对 SQLite partial index 补丁。
- [ ] 用户全部验收后再合并 `v3` 到 `main`。

## 8. 建议的记录方式

- API 层优先使用自动化 integration test；Studio 的文件夹、书签、settings、翻译和管理员体验仍需人工验收。
- 命令输出使用 `dsk --format json` / `d6s --json` 保存为证据；文件放在临时目录，不提交真实 token。
- 每轮结束记录：Directus 版本、DB vendor、DSK 版本、d6s 版本、playground 提交、通过 / 失败项。

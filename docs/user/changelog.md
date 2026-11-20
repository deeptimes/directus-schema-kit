# 更新记录

> 本文是历史版本记录。当前 v3.1 认证基线是 Directus 12.7.0 + SQLite，见 [Roadmap](../maintainer/roadmap.md) 和 [兼容性](./compatibility.md)。2.3.0 及以前条目中的 Directus 11.17.4 / 12.5.1 是当时环境，不是当前基线。

## 3.1.0（2026-11-20）

### 平台默认初始化

- 新增 `dsk bootstrap`：按 build → validate → plan → apply Schema → resources apply 执行本地初始化，不执行 seed；仅用于本地 dev，Schema 或 resources 阻断时停止后续阶段，重复执行收敛为 unchanged。
- `settings()` 白名单扩展：支持 `custom_css`、`module_bar`、`theme_light_overrides`、`theme_dark_overrides`；离线校验 module / link 结构和 theme overrides 类型，`resources apply` 仍只 PATCH 声明字段。
- `dsk init` 生成的默认工作区现在包含平台默认层：
  - `custom_css` 默认值；
  - `module_bar` 关闭 `insights` 和 `deployments`，移除 Documentation link，并锁定 `settings`；
  - `directus_presets` 的 global 布局，Icon / Color 前置且保持窄列；
  - 占位 translation `hello`（`zh-CN` / `en-US`）。
- folders 不再作为默认初始化项；`dsk init` 仍保留空的 `folders.ts` 供项目按需声明。
- 上述默认层与 `bootstrap` 已通过 Directus 12.7.0 + SQLite 实例验证。

## 3.0.0（2026-11-20）

### 系统资源覆盖

- settings、folders、presets、translations、roles、policies、access、permissions 纳入 `resources apply`，支持 create / update / unchanged / delete / conflict 分类和显式删除确认。
- settings 使用受控字段白名单，只更新声明字段；License、AI、存储、邮件、品牌图片等环境本地或敏感字段始终排除。
- folders 使用 `name + parent + type` 稳定键，覆盖 files / flows 目录及重命名、移动和引用阻断。
- presets 支持 global / role / personal 识别，personal preset 不跨环境；translations 使用 `key + language` 自然键，支持分页读取、更新、删除和 Unicode。
- 权限链支持名称契约、`id_map`、`admin_access` 审查、Public policy 和 user-scoped 排除；v12 自定义权限规则先校验 license 能力。

### 安全与发布边界

- 新增生产写入硬保护：`safety.environment` 只接受 `development`，`allowedHosts` 默认允许 loopback 和私网、默认阻断公网；`doctor` 与所有写命令统一校验。
- 跨环境发布继续由官方 `d6s`（`@directus/cli` 12.5.1）承担，DSK 不直连 staging / production；补充 scope、pull、diff、push merge、`id_map`、重复 push、mirror 删除和版本阻断验收。
- Manifest 格式保持 `manifestVersion: 1`，新增系统资源校验但仍兼容旧 Manifest；`build --check` 继续检查源码新鲜度。

### 文档与工程化

- 文档按 `docs/user` 和 `docs/maintainer` 物理拆分，`dsk init` 改为从静态 Markdown 模板生成项目内 `dsk/docs`，不再写入仓库根 `docs/directus-schema-kit.md`。
- 认证基线统一为 Node.js 22+、Directus 12.7.0 + SQLite；CI 集成矩阵同步为 12.7.0。

## 2.3.0（2026-10-29）

- Translation Strings 纳入现有 resources：DSL / Manifest 校验、`key + language` 自然键认领、分页读取、只读预览、原位更新、显式删除确认及失败后未执行项报告；旧 Manifest V1 兼容，clear / clean / reset 不扩大删除范围。
- 字段 `meta.conditions` 支持结构和 Filter 校验、安全更新、顺序比对、`null` / `[]` 显式清空；helper 支持 `conditions`，涉及隐藏时保存清空时 Plan 提示后续 Studio 数据影响。
- 补充中英文下拉示例、自动化回归与 Directus 12.5.1 + SQLite 隔离生命周期测试；实际验证范围见 [兼容性](./compatibility.md)。

## 2.2.0（2026-10-28）

### 开发环境清理

- 新增 `clean`：清空实例全部自定义集合的业务记录，保留集合结构、用户、权限配置和文件，支持 singleton 和关系依赖处理。
- 新增 `reset`：完整清理自定义 Schema、业务授权配置、非保留用户、上传文件和文件夹；覆盖代码中已移除的旧集合，通过 Files API 删除实际文件和缩略图。
- 两条命令均支持 `--dry-run`、交互确认和非交互 `--confirm`；计划明确区分代码声明项与实例未声明项。保留初始管理员及其完整授权链、settings、系统 Public policy、License 和运行配置，不执行 bootstrap、不删除数据库文件。
- 初始管理员通过 `ADMIN_EMAIL` 或 `--admin-user <id>` 识别，当前认证管理员始终保留；保留资源引用待删对象时，在写入前阻断，不通过置空引用绕过保护。
- 增加全量引用预检、权限分页完整性检查、确认后实例变化检查和清理后验证。执行首项失败即停止，保留已完成项报告；重复执行安全，不承诺事务回滚。
- 保持原有 `clear` 行为：仅清理代码声明的自定义 Schema，不扩大旧命令删除范围。

### 文档与验证

- `dsk init` 生成的 AI 规则（2.3.0 时为 `docs/directus-schema-kit.md`；v3.0 起改为 `dsk/docs/ai-guide.md` 静态模板）增加完整命令速查、日常流程、清理边界和安装包内 CLI 参考入口，供开发者及 AI 使用；同步更新 playground 示例，已有项目文档仍不自动覆盖。
- 增加规划、执行、Reader、CLI 回归测试及 CI 中的隔离清理验收；Directus 12.5.1 + SQLite 临时实例已验证 singleton、必填用户外键、实际文件删除、原管理员密码登录和重复执行。11.x 新清理路径尚待独立真实实例验收。

## 2.1.1（2026-10-27）

### AI Schema 编写规则

- 后端负责 CRUD、无需人工在 Data Studio 中填写、查看或管理的集合，必须设置集合级 `meta.hidden: true`；仍需人工查看、审核或管理的集合保持可见。
- 创建集合时，根据名称、单复数形式和业务归属设置呈现层级，通过 `group` 将附属集合归入主集合，例如 `blog_tags` 归入 `blogs`；避免仅凭前缀错误嵌套、自引用或循环层级。
- 补充可见性与层级的独立判断、自动 junction 默认行为及当前 DSL 写法示例。

上述规则已同步到 `dsk init` 的 AI 规则模板。已有项目的规则文档会被保留，升级后需手动合并这些约束。

### 兼容性与修复

- 修复普通业务集合的 `meta.group` 依赖未参与 apply 排序：所有集合统一按父级先于子级创建，支持子级先声明和多层嵌套，不再要求手工调整文件或声明顺序。
- build / validate 和 apply 写入前检查父级是否在完整 Manifest 中声明，并阻断自引用及循环依赖。
- 为 Directus 12.5.1 使用的 `@directus/schema@14.0.2` 提供 SQLite 条件唯一索引识别补丁，playground 已配置；保留条件索引及 DSK 的真实全局唯一差异检查。补丁需安装在 Directus 服务项目，不能仅靠升级 DSK 生效，详见 [兼容说明](./compatibility.md#sqlite-条件唯一索引兼容补丁)。
- 新增普通唯一、条件唯一、复合唯一、同字段混合索引，以及空库完整 apply 的回归测试；本地 Directus 12.5.1 + SQLite 连续两次重启后验证 plan 收敛及条件唯一约束仍有效。

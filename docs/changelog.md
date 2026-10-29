# 更新记录

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

- `dsk init` 生成的 `docs/directus-schema-kit.md` 增加完整命令速查、日常流程、清理边界和安装包内 CLI 参考入口，供开发者及 AI 使用；同步更新 playground 示例，已有项目文档仍不自动覆盖。
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

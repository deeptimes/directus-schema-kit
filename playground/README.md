# Directus Playground

独立的 Directus 12.5.1 本地项目，使用 IT 博客模型验证 DSK：分类、标签、文章、文件、评论、会员资料，以及 Public / Member / Editor 权限。依赖固定到 npm 最新稳定版的当前升级基线；兼容结论见 [兼容性](../docs/compatibility.md)。

## 安装、升级与启动

```bash
cd playground
cp .env.example .env  # 仅首次初始化；已有配置不要覆盖
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm dev
```

已有数据库必须先备份，`bootstrap` 会安装或迁移 Directus 系统表。数据位于 `database/`，上传文件位于 `uploads/`；备份应覆盖数据库、上传文件和本地环境配置。不要直接使用 v11 读取已迁移的 v12 数据库。

首次初始化在 `.env` 设置管理员邮箱、密码和安全 `ADMIN_TOKEN`；已存在的管理员不会被 bootstrap 重置。DSK 连接变量为 `PUBLIC_URL` / `ADMIN_TOKEN`，Directus license 可通过自身设置或 `LICENSE_KEY` 配置。

仓库已包含 `dsk/` 示例；再次 `pnpm dsk init` 不会覆盖现有定义。

## 验证流程

```bash
pnpm typecheck
pnpm dsk doctor
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk plan
pnpm dsk seed --plan
pnpm dsk seed
pnpm dsk seed --plan
pnpm dsk resources apply --dry-run
pnpm dsk resources apply
```

二次 Schema Plan 应全部 unchanged，二次 Seed 计划应有 10 条 unchanged。示例的 `dateTime` 使用不带时区的日期字符串；真正的跨时区时间点应声明 timestamp。

博客权限包含发布状态、会员访问、当前用户、字段限制和校验，要求 Directus v12 启用 `custom_permission_rules_enabled`。Core 未启用该能力时，资源同步会在任何资源写入前拒绝执行；这不是 Schema 或关系不兼容。不要删掉规则来让测试通过，也不能把 Core 的阻断测试视为会员权限验收通过。

## 回归范围

Kit 根目录的 CI 已覆盖 Directus 11.17.4 / 12.5.1 + SQLite，包括八类关系、基础字段、Seed、六类资源、幂等与 Clear；有许可时验证匿名过滤，无许可时验证写入前阻断。连接测试实例的方法见 [DSK 实现与验收](../docs/development.md)。

完整 Data Studio 编辑、会员／编辑角色的实际业务权限仍需在有对应许可的一次性实例人工验收。Clear 只用于可丢弃实例，执行前必须审查完整计划，不要清理已有业务数据来解决升级冲突。

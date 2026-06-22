# 在线付费课程 Playground

这是一个独立的 Directus 11.17.4 项目目录，用于手工验证 DSK 的初始化、Schema、系统资源、Seed 和幂等执行流程。业务模型模拟在线付费课程，包含课程目录、章节课时、订单、报名、学习进度、评价，以及学生、讲师和运营角色策略。

## 安装与初始化

```bash
cd playground
cp .env.example .env
pnpm install
pnpm dsk init
```

仓库已经保留一套初始化后的 `dsk/` 示例。再次运行 `pnpm dsk init` 只会保留现有文件，不会覆盖课程项目定义，可用于验证初始化幂等性。

## 启动与应用

```bash
pnpm dev
```

首次启动后，登录 `http://localhost:8055`，为管理员创建静态 Token 并写入 `.env` 的 `DIRECTUS_TOKEN`。然后在另一个终端执行：

```bash
pnpm dsk doctor
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk seed --plan
pnpm dsk seed
pnpm dsk resources apply --dry-run
pnpm dsk resources apply
```

建议先应用 Schema，再应用 Seed 和系统资源。重复执行 `plan`、`seed` 和 `resources apply` 可验证幂等性。

## 测试重点

- Schema 跨文件关系、collection group、全量清理范围。
- string、text、integer、decimal、boolean、dateTime、json、status、sort、audit 和 M2O 字段。
- `CASCADE`、`SET NULL`、`RESTRICT` 等关系删除策略。
- Seed 自然键、跨集合引用和重复应用。
- 学生、讲师、运营角色，Policy、Access、Permission 和 Preset 的引用与同步。
- 按当前用户、发布状态、课程归属进行权限过滤。

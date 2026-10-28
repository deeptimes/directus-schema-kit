# DSK 实现与验收

本文面向维护 DSK 本身的开发者。业务项目工作流见 [配合 Directus 开发](./directus-development.md)，产品需求与交付标准见 [Roadmap](./roadmap.md)。

## 模块职责

| 模块 | 职责与约束 |
| --- | --- |
| `src/dsl/` | 固定 TypeScript DSL，展开关系 blueprint |
| `src/manifest.ts` | 通过 jiti 执行可信 DSL，确定性构建、排序、记录源码摘要 |
| `src/validate.ts`、`schemas/` | 离线校验结构、重复定义、关系完整性和源码新鲜度 |
| `src/plan.ts` | 纯函数比较 Manifest 与实例状态，只比较明确声明的属性 |
| `src/directus.ts` | Reader 只读 GET；Writer 提供明确写方法，处理脱敏与有限重试 |
| `src/apply.ts` | 全量预检、依赖排序、最小 PATCH、串行执行和失败停止 |
| `src/seed.ts`、`resources.ts`、`clear.ts`、`cleanup.ts`、`cleanup-reader.ts` | 基础数据、系统资源和独立清理路径 |
| `src/commands.ts`、`cli.ts` | 命令编排、文本／JSON 输出和退出码，不承载差异业务逻辑 |

Apply 的创建顺序为 group → collection（主键随集合 POST）→ 非 alias 字段 → relation → alias 字段。group 按父子依赖排序，主键不会重复 POST。更新请求只发送 Plan 中变化的白名单属性；关系仅允许安全更新 `meta.sort_field`。

Reader 并发读取 collections / fields / relations。Writer 对 429、502、503、504、超时及网络错误采用有限重试，默认最多请求三次；确定性 4xx 和 DELETE 的 HTTP 失败响应不重试，网络异常仍走有限重试。

Seed 按文件名、批次和 item 确定性执行，自然键索引分页加载；引用优先命中本次缓存，再查询实例，无法解析即停止。系统资源在同步前检查 v12 自定义权限规则许可，再通过业务字段匹配、拓扑排序解析引用。Clear 先处理关系字段（包括其他自定义集合指向目标集合的关系字段），再按子到父顺序删除集合，最后删除 group；单项失败会记录并继续清理，其结果通过 failures 汇总。

## 结果契约

以下为内部执行结果，CLI 的全局参数与退出码统一见 [CLI 参考](./cli-reference.md)。

| 入口 | 稳定结果 |
| --- | --- |
| `createPlan(manifest, state, targetUrl, databaseClient?)` | `planVersion: 1`；manifestDigest、target、operations、summary |
| `executeApply({ manifest, plan, writer, dryRun })` | `applyVersion: 1`；success / blocked / failed；completed、failed、notExecuted、blocked、skippedUnchanged |
| `runSeeds()` | `seedVersion: 1`；create / update / unchanged 计数和操作结果 |
| `syncResources()` | `resourceSyncVersion: 1`；create / update / unchanged / delete / conflict 操作和完成项 |
| `executeCleanup()` | `cleanupVersion: 1`；data / full；planned / blocked / failed / success；operations、protected、blockers、completed、verified；不输出快照原始数据 |
| `executeClear()` | `clearVersion: 1`；planned / success / blocked / failed；operations、completed、failures |

Plan 始终比较完整 Manifest，target.url 仅保留 origin；operation 包含 source、resourceType、resource、action、risk、executable、changes 和可选 reason。Apply 拒绝与 Manifest 摘要不一致的 Plan。

仅 `DB_CLIENT=sqlite3` 时，将实例的 `float + numeric_precision=null + numeric_scale=null` 与目标 decimal 视为 SQLite 的同一种表示；其他数据库的类型或精度差异仍为 dangerous。该兼容只消除误报，不代表 SQLite 浮点具备十进制定点精度。

## 开发检查

工具链使用 Node.js 22+、TypeScript strict mode、pnpm；CI 的 pnpm 版本为 11.5.2。Directus 认证环境统一见 [兼容性](./compatibility.md)。

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

涉及 Adapter、关系展开、Plan/Apply 或资源同步时，还需在一次性 Directus 测试实例运行：

```bash
DSK_INTEGRATION_URL=http://127.0.0.1:8055 \
DSK_INTEGRATION_EMAIL=admin@example.com \
DSK_INTEGRATION_PASSWORD='<本地测试密码>' \
pnpm test:integration
```

也可通过 `DSK_INTEGRATION_TOKEN` 提供认证；`DSK_INTEGRATION_VERSION` 可校验连接的实际服务版本。缺少连接／认证配置时，集成测试会 skip，不能当作通过。CI 的 Directus 11.17.4 / 12.5.1 + SQLite 服务矩阵配置见 [ci.yml](../.github/workflows/ci.yml)。

发布前执行 `pnpm check:release`。纯文档修改检查相对链接、旧路径和代码契约一致性即可，不要求启动实例或执行完整测试。

## 回归重点

- DSL / Build / Validate：helper、八类关系展开、alias / junction / 外键完整性、重复定义、确定性输出与源码摘要。
- Plan / Apply：五类差异、更新白名单、SQLite 归一化、只读边界、全量阻断、依赖顺序、最小 PATCH、重试及失败停止。
- Seed / Resources：自然键、跨集合和同集合引用、系统引用、拓扑、业务键冲突、删除确认与幂等收敛。
- Clear：关系优先、子到父顺序、循环关系、交互／脚本确认及系统集合硬保护。
- Clean/Reset：实例额外项、分页完整性、管理员继承与直接授权、Public policy、保留资源引用、循环记录、计划变化、文件存储删除及重复执行。
- CLI：版本化 JSON、退出码、stdout 契约和凭证脱敏。

在一次性实例人工验收 init 不覆盖文件、首次 apply 后二次 plan 无可执行差异、seed/resources 重复执行 unchanged。Data Studio 必须检查 Markdown / Tags / Code / Toggle 及八类关系的选择、编辑、上传、排序和展示；clear 回车或输入 n 不应删除，明确确认后只清理声明的自定义 Schema。


清理功能的真实集成验收使用独立临时实例，不接受现有实例 URL：

```bash
DSK_CLEANUP_PROJECT=playground node --import tsx --test test/integration/cleanup.integration.test.ts
```

需目标项目已安装 Directus。测试夹具在临时目录初始化 SQLite、独立端口和上传目录，验证 clean、reset、文件真实删除及原管理员密码重新登录；夹具初始化不属于产品清理路径。缺少 `DSK_CLEANUP_PROJECT` 时跳过。

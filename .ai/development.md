# 开发与验收

## 支持基线

| 项目 | 当前基线 |
| --- | --- |
| Node.js | 22+ |
| TypeScript | strict mode |
| Directus | 11.17.4 |
| 数据库 | SQLite |
| 包管理器 | pnpm 11.5.2 |
| Manifest | V1 |

Directus 12.0.2 只完成结构评估，不能标记为正式支持。

## 分层测试重点

- DSL / Build：helper 输出、关系 blueprint 展开、确定性 Manifest 和源码摘要。
- Validate：JSON Schema、重复资源、alias/junction/外键完整性、seed 和 Manifest 新鲜度。
- Plan：五类差异、安全更新白名单、SQLite decimal 归一化和只读网络边界。
- Apply：全量预检、依赖顺序、最小 PATCH、重试边界、失败后停止和幂等收敛。
- Seed / Resources：自然键、引用拓扑、系统引用、重复业务键和删除确认。
- Clear：关系优先删除、子到父顺序、循环关系、确认护栏和系统集合保护。
- 集成：完整 Schema、八类关系、seed、六类系统资源、二次 Plan 和 Clear 生命周期。

## 本地检查

```bash
pnpm typecheck
pnpm test
pnpm build
```

涉及 Directus Adapter、关系展开、Plan/Apply 或资源同步时，还需运行：

```bash
pnpm test:integration
```

发布前运行：

```bash
pnpm check:release
```

小范围纯文档修改不要求执行完整测试，但必须检查 Markdown 链接和与代码契约的一致性。

## 人工验收

自动测试通过后，在一次性本地实例确认：

1. `init` 重复执行不覆盖文件；build/validate 成功且 Manifest 不含敏感值。
2. 首次 apply 后第二次 plan 收敛；seed 和 resources 重复执行均 unchanged。
3. Data Studio 可正确创建和编辑 Markdown、Tags、Code、Toggle。
4. M2O、O2M、M2M、M2A、Translations、File、Image、Files 的选择、编辑和展示正确。
5. `clear` 先展示完整范围，回车或 `n` 不删除；明确确认后仅清理自定义 Schema。

## 关键实现决策

- Plan Engine 是纯函数，网络读取和写入使用分离 Adapter。
- 未声明的实例资源不会被推断为删除；白名单外差异默认 conflict。
- Apply 遇到任一 conflict/dangerous 全量阻断，写入串行且不伪装为事务。
- Manifest V1 不包含 modules；所有定义全局组合，`source` 只用于定位。
- 复合关系必须展开为完整 junction、字段和 relations；不得用单 alias 模拟。
- 普通 Schema apply 永不删除；系统资源删除和 Clear 使用不同的显式授权路径。

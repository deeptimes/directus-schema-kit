# 测试与认证环境

## 当前自动测试

- DSL、Manifest、init、validate 和源码新鲜度。
- Schema plan 五类差异与安全 apply 编排。
- HTTP GET-only Reader、有限重试和确定性 4xx 不重试。
- Seed 自然键、跨批次引用、缺失引用和 dry-run/plan/apply。
- 八类系统资源创建、引用拓扑、重复业务键冲突和删除确认。
- Clear 模块范围、关系顺序、循环关系、双重确认及系统集合保护。

## 唯一认证环境

| 项目 | 版本/状态 |
| --- | --- |
| Node.js | >=22（CI 使用 22） |
| Directus | 11.17.4 |
| 数据库 | SQLite |
| 包管理器 | pnpm 11.5.2 |
| 实例读取 | collections、fields、relations 及八类系统资源通过 |
| 零写入流程 | apply dry-run、seed dry-run、resources dry-run、clear plan 通过 |
| 完整写入生命周期 | Schema、Seed、八类系统资源、幂等收敛和 Clear 通过 |

DSK 当前不声明其他 Directus 版本的兼容性，也不把操作系统作为兼容矩阵维度。CI 使用 Linux 运行上述唯一认证环境。

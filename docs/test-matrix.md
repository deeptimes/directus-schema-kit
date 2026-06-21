# 测试与认证环境

## 当前自动测试

- DSL、Manifest、init、validate 和源码新鲜度。
- Schema plan 五类差异与安全 apply 编排。
- HTTP GET-only Reader、有限重试和确定性 4xx 不重试。
- Seed 自然键、跨批次引用、缺失引用和 dry-run/plan/apply。
- 六类 V1 系统资源创建、引用拓扑、重复业务键冲突和删除确认。
- Clear 模块范围、关系顺序、循环关系、双重确认及系统集合保护。
- Manifest V2、普通字段 interface helper 和八类关系 blueprint 展开/校验。

## 唯一认证环境

| 项目 | 版本/状态 |
| --- | --- |
| Node.js | >=22（CI 使用 22） |
| Directus | 11.17.4 |
| 数据库 | SQLite |
| 包管理器 | pnpm 11.5.2 |
| 实例读取 | collections、fields、relations 及六类 V1 系统资源通过 |
| 零写入流程 | apply dry-run、seed dry-run、resources dry-run、clear plan 通过 |
| 完整写入生命周期 | Schema、八类关系、Seed、六类 V1 系统资源、幂等收敛和 Clear 通过 |

Directus 12.0.2 已完成官方类型结构评估，但不声明正式支持；结论见 [兼容矩阵](./compatibility.md)。CI 使用 Linux 运行上述唯一认证环境。

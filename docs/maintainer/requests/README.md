# 历史需求

这些文档记录 DSK 2.2.0 时期的原始需求和验收标准，不是当前能力清单；实现状态以 [Roadmap](../roadmap.md) 和 [兼容性](../../user/compatibility.md) 为准。

| 文档 | 状态 |
| --- | --- |
| [Translation Strings 原生同步需求](./schema-kit-translations-request.md) | 核心已实现于 2.3.0；`$t:` 引用完整性检查仍属后续增强 |
| [字段条件元数据更新需求](./schema-kit-field-conditions-request.md) | 已实现于 2.3.0 |

保留这些文档的原因是：它们包含真实使用场景、边界条件和验收清单，可作为回归测试和后续增强（例如 `$t:` 引用检查）的参考。文中 DSK 2.2.0 / Directus 12.5.1 是当时环境，不应作为当前版本说明引用。

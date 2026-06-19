# Decision Log

## 2026-06-19：Plan 采用纯函数与只读 Adapter

- Plan Engine 不发起网络请求，输入为 Manifest 和标准化 DirectusState。
- DirectusReader 当前只暴露批量读取，不与未来写入 Adapter 混用。
- 未声明的实例资源不产生删除计划；白名单外差异默认 conflict。
- 字段约束和关系语义变化默认 dangerous。
- V1 拒绝连接公网 Directus 地址，避免本地工具误指向生产环境。

## 2026-06-19：Apply 使用全量阻断和串行执行

- 任一 conflict/dangerous 会在首个写请求前阻断整个 apply。
- 更新请求按 Plan change 生成最小 PATCH，不发送完整资源对象。
- 写入串行执行；失败后停止并保留部分成功报告，不宣称事务回滚。
- Plan 摘要必须与 Manifest 摘要一致。

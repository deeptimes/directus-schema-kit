# Directus Schema Kit：字段条件元数据更新需求

日期：2026-10-29。用途：交给负责 `@deeptimes/directus-schema-kit` 的对话评估和实现。

这是独立于 [Translation Strings 支持需求](schema-kit-translations-request.md) 的另一项能力补齐。本文仅整理需求，不授权修改 schema-kit 仓库、发布包或清理其他实例。

## 1. 问题与目标

DSK 2.2.0 能在 TypeScript 定义和 Manifest 中表达字段的 `meta.conditions`，但对已有字段更新这项属性时，plan 将其标记为 `conflict`，理由为“字段包含未列入安全更新白名单的差异”。

希望 DSK 在校验条件结构、明确展示差异后，能够通过正常 schema `plan / apply` 更新这些条件，避免项目单独调用 Directus 字段 API。

需求针对 Data Studio 的动态表单：根据其他字段的值，调整当前字段的显示、必填、只读、界面选项，以及隐藏时保存清空行为。第一版应至少覆盖本文实际用到的显示、必填和条件内清空属性；其他属性的支持范围由维护方按 Directus 版本核对。

## 2. 当前版本与已确认事实

本项目环境：DSK **2.2.0**、Directus **12.5.1**、SQLite。以下结论针对本地已安装版本，实施前需核对 schema-kit 仓库当前实现。

已检查发布包：

- `dist/types.d.ts` 的 `FieldMeta` 包含 `conditions`。
- `dist/plan.js` 的 `safeFieldMeta` 包含 `hidden`、`required`、`readonly`、`options` 等，但没有 `conditions`。
- `createPlan()` 会通过 `compareUnsupported()` 将 `meta.conditions` 差异归为 conflict。
- `dist/apply.js` 的 `executeApply()` 遇到 conflict / dangerous 时返回 blocked。因此条件差异不仅无法写入，还会阻断同一计划中的其他可执行变更。

本项目当时的实际计划摘要：

```text
create 0 / update 0 / unchanged 180 / conflict 5 / dangerous 0
```

五项冲突分别是：

| 字段 | 差异路径 |
|---|---|
| `article_contexts.object` | `meta.conditions` |
| `article_contexts.other_object` | `meta.hidden`、`meta.conditions` |
| `article_contexts.sign` | `meta.hidden`、`meta.conditions` |
| `article_contexts.house` | `meta.hidden`、`meta.conditions` |
| `article_contexts.aspect` | `meta.hidden`、`meta.conditions` |

其中 `meta.hidden` 本身属于现有白名单，真正导致这些字段整体冲突的是同时存在的 `meta.conditions` 差异。

## 3. 项目的实际用途

文章调用条件按 `type` 填写不同字段：

| `type` | 显示且必填的条件字段 |
|---|---|
| `object` | `object` |
| `sign` | `sign` |
| `house` | `house` |
| `object_sign` | `object`、`sign` |
| `object_house` | `object`、`house` |
| `house_sign` | `house`、`sign` |
| `aspect` | `object`、`other_object`、`aspect` |

不适用的条件字段隐藏，并在保存时清空旧值，避免用户先填写相位条件、再改为星座条件后，隐藏的对象和相位值仍被提交，触发后端拒绝。

实际定义位于 [`dsk/schemas/content.ts`](../dsk/schemas/content.ts)。下面是 `object` 字段的等价元数据示例，已在 Directus 12.5.1 应用并回读验证：

```ts
meta: {
  hidden: true,
  required: false,
  conditions: [
    {
      name: '适用类型显示并必填',
      rule: {
        type: { _in: ['object', 'object_sign', 'object_house', 'aspect'] },
      },
      hidden: false,
      required: true,
      options: {},
    },
    {
      name: '其他类型隐藏并清空',
      rule: {
        type: { _nin: ['object', 'object_sign', 'object_house', 'aspect'] },
      },
      hidden: true,
      required: false,
      clear_hidden_value_on_save: true,
      options: {},
    },
  ],
}
```

注意 `clear_hidden_value_on_save` 在本例中位于 **conditions 的某个条件对象内部**。已检查本环境 `directus_fields` 的列，没有同名顶层存储列；Studio 从命中的条件中读取该属性。不能为支持该功能就擅自新增系统表列，或假设所有 Directus 版本都接受同名顶层字段属性。

这些是表单行为配置，不代替后端业务校验或权限。直接调用 API 的客户端不应被假设会自动执行 Studio 的隐藏清空逻辑；后端仍需独立校验提交条件。

## 4. 当前处理结果

本项目已经在源代码中维护条件定义，并采取以下临时步骤完成部署：

1. 生成 Manifest，审查五个字段的计划差异。
2. 通过官方 `PATCH /fields/article_contexts/{field}`，仅更新目标字段的 `meta.hidden`、`meta.required` 和 `meta.conditions`。
3. 回读字段，确认实际元数据与 Manifest 一致。
4. 使用 Directus 的规则校验器验证七种 type 对应的显示 / 必填组合，并与后端 `contextKey()` 的有效输入核对。
5. 重新 plan，得到 `185 unchanged / 0 conflict / 0 dangerous`。

用户已在 Studio 看到动态显示效果并确认。没有为这次条件配置更新清理业务集合或修改业务记录。

当前实例已经与源码一致，因此现在运行 plan 不会再次出现上述五个冲突。复现旧问题应使用模拟状态或隔离实例，不要为了复现而回退正在使用的后台配置。

## 5. 建议实现范围

### 5.1 类型、Manifest 与校验

沿用现有 `FieldMeta.conditions`，不要求新增 helper 或独立命令。

- 核对 DSL、JSON Manifest 校验、状态读取及官方字段 API 写入链路均能保留条件内容。
- 条件规则使用 Directus Filter 结构，不执行 JavaScript、不引入项目自定义表达式引擎。
- 校验数组、条件对象、规则结构及已支持属性的类型；`hidden`、`required`、`readonly` 和清空开关等不能接受任意字符串冒充布尔值。
- 保留嵌套 `options`、Unicode 条件名称及合法过滤操作符。
- 对目标 Directus 版本不支持的属性，提供明确诊断；不要静默丢弃，也不要盲目透传未知属性后宣称应用成功。
- 不要求第一版实现完整的业务可达性分析或证明条件间互斥；确有可检出的结构错误应指出来源文件、集合、字段和条件位置。

### 5.2 Plan 的比对语义

至少覆盖以下操作：

| 声明变化 | 预期结果 |
|---|---|
| 现有字段没有条件，声明新增条件 | 显示 `meta.conditions` 差异并允许经过审查后更新 |
| 修改规则、条件属性或选项 | 展示前后差异，不能继续一律报“未在白名单” |
| 新增、删除某一条条件 | 视为条件数组更新，不删除字段或重建集合 |
| 调整条件顺序 | 保留并识别变化，不能忽略 |
| 显式清空条件 | 按明确的 `null` / 空数组策略移除条件 |
| 声明未包含 `conditions` | 沿用 DSK 对未声明属性的既有语义，不能擅自等同显式清空 |
| 条件完全一致 | `unchanged` |

条件顺序可能影响 Studio 首个命中条件的选择，不能为了“稳定输出”对条件数组排序。对象属性键顺序通常不影响语义；规范化时必须区分对象与有序数组。

需要根据 Directus 实际回读行为定义 `null` 与空数组是否可等价，避免反复 apply 后永远显示差异；不要因此把“属性缺省”也一并归为显式清空。

### 5.3 风险与应用边界

不建议把整个 field meta 或所有未知属性都加入自动更新白名单。仅补齐明确支持、经过验证的条件元数据。

尤其需要区分：

- `meta.required` 是表单必填设置；`schema.is_nullable` 是数据库约束，两者不能互相改写。
- 更新条件配置本身只应 PATCH 字段元数据，不应修改字段类型、唯一性、外键、默认值或业务数据。
- `clear_hidden_value_on_save: true` 会影响用户后续在 Studio 保存条目时的数据内容，可能清空旧字段值。计划必须显示这类变化，不能描述成“没有任何数据影响”。
- 新增条件支持不能放宽字段类型变化、唯一约束变化、`meta.special` 等既有保护。

条件更新究竟归为现有可执行 `update`，还是对部分清空行为增加风险提示，应由维护方结合 DSK 风险模型确定。最低要求是提供清晰、可审查且可执行的路径，无须手写 API 或重建模型。

执行时建议：

1. 使用官方字段 API，仅发送已审查的变更属性。
2. dry-run 绝不发送写请求。
3. 应用后回读 / 重新计划，确认目标值落地。
4. 条件合法性导致 API 拒绝时，报告集合、字段及失败原因，保留现有失败 / 未执行报告机制，不声称整体事务回滚。
5. 对部分成功情况允许重新 plan 后继续，第二次成功执行应收敛为 unchanged。

## 6. 验收标准

建议覆盖：

1. **本次场景复现**：用旧字段状态和本项目五字段条件构造计划，新增支持后不再因 `meta.conditions` 被统一判 conflict；原先已有的 hidden 更新能一并执行。
2. **新增与修改**：通过官方 API 更新已有字段，无须删除 / 重建集合；回读内容与声明一致。
3. **顺序**：构造多个同时可能命中的条件，交换顺序能够产生计划差异，应用后保持目标顺序。
4. **清空与缺省**：分别验证未声明、显式 `null`、显式空数组，符合约定且不会出现永久差异。
5. **动态表单**：Studio 中按 type 显示正确字段，显示字段必填，不适用字段隐藏。
6. **隐藏时保存清空**：先填相位条件，再切换为其他类型并保存；不适用旧值被清空，仍适用的值保持正确，后端接收合法输入。普通 API 请求不会被测试误认为自动具有相同的 Studio 行为。
7. **只读与幂等**：dry-run 无写请求；应用后再次 plan 为 unchanged，再次 apply 不写入。
8. **数据库边界**：元数据更新前后，字段类型、nullable、唯一性、默认值与外键不变；应用元数据当下不改写已有业务记录。
9. **无效条件**：错误数组 / 属性类型、非法规则等有可定位诊断；不静默丢弃条件。
10. **保护回归**：真正的字段类型、数据库约束及未支持属性变化仍受原有危险 / 冲突机制保护。
11. **失败恢复**：权限不足或某字段更新失败时报告准确，重新计划和应用可恢复。
12. **版本证据**：至少在支持范围内的真实 Directus 隔离实例验证字段 API 和 Studio 行为；明确哪些版本经过测试。

## 7. 与 Translation Strings 需求的关系

两项功能可分别实现、分别验收：

- Translation Strings：增加 `/translations` 系统资源的声明、自然键匹配与同步。
- Field conditions：补齐已有字段 `meta.conditions` 的校验、差异计划及更新支持。

不应把其中一项实现当作另一项已经解决，也不需要为二者引入统一的新配置层。两个需求完成后，本项目的选项翻译和动态表单都可以通过正常 DSK 工作流部署。

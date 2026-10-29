# Directus Schema Kit：Translation Strings 原生同步需求

日期：2026-10-29。用途：交给负责 `@deeptimes/directus-schema-kit` 的对话评估和实现。

本文区分当前项目已验证的事实与建议新增的工具能力。下文的 API 示例属于设计建议，尚不是 DSK 2.2.0 已提供的 API。本文不授权修改 schema-kit 仓库、发布 npm 包或操作其他项目实例。

## 1. 希望解决的问题

希望 DSK 能声明、校验、比对并同步 Directus 原生 Translation Strings，使项目的下拉选项、占位文字、字段说明等随 Data Studio 的界面语言切换。

目标是让其他项目只维护 schema 和翻译声明，通过现有 DSK 工作流部署，不必为每个项目编写独立翻译同步脚本。

本需求针对后台界面文字，不涉及文章正文的多语言版本、业务翻译表、自动机器翻译或前端应用自身的 i18n 系统。

## 2. 当前环境与已验证事实

本项目使用 DSK **2.2.0**、Directus **12.5.1**、SQLite。以下结论针对本地已安装版本；实施前请以 schema-kit 仓库当前代码为准，不把本文当作最新版本能力清单。

### 2.1 集合 / 字段名称与选项文字是两种机制

DSK 当前会把 `collection({ label: '文章分类', ... })` 和字段的中文 `label` 转换为 `meta.translations` 中的 `zh-CN` 名称翻译。英文界面没有相应名称翻译时，Directus 使用集合 / 字段标识生成可读名称，例如 `article_categories` 显示为 `Article Categories`。

这不意味着普通选项的 `text: '太阳'` 也会自动产生英文版本。

Directus 原生支持 Translation Strings：在 `/translations` 维护 `key`、`language`、`value`，界面配置使用 `$t:翻译键` 引用，Studio 根据当前语言显示对应文字。

官方说明：[Directus Translations](https://directus.com/docs/guides/content/translations)。同时已检查当前安装的 Studio 代码，确认其支持加载 `/translations` 并解析 `$t:` 引用。

### 2.2 本项目的实际用例

`article_contexts` 中以下七个字段已经使用多语言选项：

| 字段 | 中文示例 | 英文示例 | 保存值示例 |
|---|---|---|---|
| `type` | 对象落座 | Object in sign | `object_sign` |
| `chart_type` | 本命盘 | Natal chart | `natal` |
| `object` | 太阳 | Sun | `sun` |
| `other_object` | 月亮 | Moon | `moon` |
| `sign` | 白羊座 | Aries | `aries` |
| `house` | 第 1 宫 | House 1 | 数值 `1` |
| `aspect` | 刑相（90°） | Square (90°) | `square` |

两种语言为 `zh-CN` 和 `en-US`。共 72 个翻译键、144 条语言记录；对象与第二对象共用翻译，所以七个字段合计 95 个选项引用，并不需要 190 条语言记录。

已通过官方 API 写入并回读核对所有引用和翻译；再次运行同步检查为 `create: 0 / update: 0 / unchanged: 144`。原有条件显示规则、字段类型和选项保存值保持一致。用户已在 Studio 看到更新并确认显示符合预期。

### 2.3 DSK 当前缺口

本地 DSK 2.2.0 的公开 `ResourceType` 为：

```ts
'folders' | 'roles' | 'policies' | 'access' | 'permissions' | 'presets'
```

未包含 `translations`。Schema 已经可以保存 `$t:` 字符串，但对应翻译记录尚未纳入 DSK 的资源声明及同步流程。只执行 `dsk build`、schema apply 或现有 resources apply，不会创建本项目这些翻译记录。

## 3. 本项目临时实现，可作为参考

从 Directus 项目根目录查看：

- [`dsk/translations/article-contexts.ts`](../dsk/translations/article-contexts.ts)：中英文定义；复用占星目录的稳定 ID、中文名和英文名，同时生成下拉 choices 与翻译记录。
- [`dsk/schemas/content.ts`](../dsk/schemas/content.ts)：字段引用生成的 choices。
- [`tools/content-translations.mjs`](../tools/content-translations.mjs)：通过官方 `/translations` API 同步。

示例配置：

```ts
// 字段选项：保存值保持稳定，显示文字引用翻译键。
{ value: 'sun', text: '$t:astroreflect.context.object.sun' }

// 对应的两条 Translation Strings 记录。
{ key: 'astroreflect.context.object.sun', language: 'zh-CN', value: '太阳' }
{ key: 'astroreflect.context.object.sun', language: 'en-US', value: 'Sun' }
```

临时同步脚本的行为：

1. 默认仅检查，只有显式 `--apply` 才写入。
2. 只读取本项目 `astroreflect.context.` 命名空间的记录。
3. 按 `key + language` 查找现有记录；缺少时创建，文字不同时原位更新，相同时跳过。
4. 实例中同一自然键有多条记录时直接报错，不任意选择或自动合并。
5. 不硬编码实例 ID，不直接操作系统表，不删除其他翻译。
6. 不把令牌写入声明或日志；目标地址和凭据从环境读取。

该脚本是本项目的补充工具，不是完整的通用资源引擎。它没有提供 DSK 统一的 Manifest 校验、资源计划 / 报告、显式删除流程或完整引用分析。

## 4. 建议的最小实现范围

建议优先把 `translations` 纳入现有资源系统，复用既有 `resource()`、Manifest、resources dry-run / apply、删除审批与报告机制。

### 4.1 声明接口

建议用现有形式扩展，而非先增加一套独立 CLI。下面只是拟议写法，最终接口由 schema-kit 维护方确定：

```ts
import { resource } from '@deeptimes/directus-schema-kit'

export default [
  resource('translations', {
    key: 'context-object-sun-zh-cn',
    data: {
      key: 'astroreflect.context.object.sun',
      language: 'zh-CN',
      value: '太阳',
    },
  }),
  resource('translations', {
    key: 'context-object-sun-en-us',
    data: {
      key: 'astroreflect.context.object.sun',
      language: 'en-US',
      value: 'Sun',
    },
  }),
]
```

两种 `key` 含义不同：外层 `resource.key` 是 DSK 声明标识；`data.key` 是 Directus 翻译键。实例匹配必须使用 `data.key + data.language`，不能依赖某个实例的 UUID，也不能仅按翻译键匹配而覆盖另一种语言。

声明可以放在现有 `dsk/resources/` 下，不要求所有项目采用本项目临时的目录组织。所有语言记录应进入生成的 JSON Manifest，后续部署无需再次执行项目 TypeScript。

### 4.2 计划与应用

| 实例与声明的关系 | 预期行为 |
|---|---|
| 没有对应 `key + language` | `create` |
| 已有对应记录，文字不同 | `update`，保留原记录 ID |
| 已有对应记录，文字一致 | `unchanged`，不发送写请求 |
| 实例中自然键重复 | 明确冲突并阻止该项应用 |
| 实例有其他未声明记录 | 保留，不纳入隐式删除 |
| 源码移除一个原声明 | 保留实例记录，遵循 DSK 显式删除机制 |

建议要求：

- `resources apply --dry-run` 完全只读，展示新增及修改差异。
- 真实 apply 只调用官方 `/translations` API，不直接写 `directus_translations`。
- 显式删除需准确匹配 `key + language`，沿用 `delete: true` 和破坏性操作确认；不存在时应有确定、可重复的结果。
- 翻译键或语言改变应按新的自然键处理，不猜测重命名、不自动删除旧记录。
- 分页读取、匹配和输出顺序稳定，不依赖实例默认返回条数，也不要求一次无限制读取全部系统翻译。
- API 权限不足、请求失败或部分成功时，报告已完成、失败及未执行项；不能假设多次 HTTP 写入具有整体事务回滚。
- 允许重新计划和再次执行，收敛为全部 `unchanged`。

### 4.3 本地声明校验

第一版应覆盖：

- 必要字段 `key`、`language`、`value` 的类型和 Directus 实际约束。
- 同一 Manifest 中重复的 `data.key + data.language`，报错时指出来源文件。
- DSK 外层资源标识重复，沿用已有规则。
- 空翻译键、空语言及无效的记录结构。
- 空文字是否允许需依据 Directus 能力和 DSK 明确策略决定，不应未经确认就把所有空字符串视为非法。
- 语言标识按 Directus 的格式保存，避免同步时擅自将 `zh-CN` 改成 `zh_CN` 或改变大小写。
- 保留 Unicode、换行及特殊字符；不要将合法文字转换为 HTML、执行插值或改变原意。

不要把本项目的命名空间、两种语言、占星对象或私网地址检查硬编码进通用 DSK 功能，应复用 DSK 自身目标环境和安全规则。

## 5. 翻译引用检查：建议作为后续增强

工具可以检查字段 options 中的 `$t:` 引用，但不宜在第一版对所有未声明引用直接报错。

原因是引用可能指向 Directus 内置词条，或实例中由其他来源维护的 Translation Strings。项目也可能只显式维护部分语言。

建议先保证资源同步可用，再考虑：

- 对项目声明管理的翻译键或显式管理的命名空间进行完整性检查。
- 对项目指定的目标语言提示缺失记录。
- 未能判断归属的引用采用提示或可配置策略。
- 覆盖字段 options、placeholder、note 等真正支持 Translation Strings 的位置，避免把所有普通文本都当作引用。

具体配置名称和接口由维护方设计；本文不要求为这个增强引入新的配置系统。

## 6. 与现有流程的关系

### Schema 与资源

Schema 中仍是普通 `$t:` 字符串，语言文字作为资源管理。两者要能独立生成计划和部署。

在部署说明中给出推荐顺序，避免 Studio 暂时显示未解析的翻译键。不要为了优先写入翻译而把全部 resources 强制放到 schema 之前：permissions 等既有资源可能依赖已经创建的集合。若工具提供组合流程，应根据实际依赖编排。

### Clear / reset

不要因翻译引用位于某个集合，就在清理该集合时自动删除系统翻译。一个翻译键可以被多个字段共用。

明确说明 translations 与现有 clear / clean / reset 的关系；保留现有命令的已定义边界。翻译删除走资源自己的显式机制，不顺带扩大系统资源清理范围。

### 现有项目的接入

本项目已通过官方 API 创建了翻译记录。DSK 新能力首次接入时应按自然键认领并比较这些记录，不因它们不是由 DSK 创建就重复插入。

项目将现有定义转换为原生 resources 后，可移除独立同步脚本；无需改变下拉选项的保存值，无需重建业务集合或清空用户数据。

## 7. 验收标准

建议至少覆盖以下自动化或真实实例验证：

1. **构建与离线校验**：translations 进入 Manifest；重复声明及无效结构有清楚错误；JSON 输入与 TypeScript DSL 结果一致。
2. **新实例同步**：同一翻译键的 zh-CN / en-US 分别创建成功，回读 key、language、value 正确。
3. **认领已有记录**：先通过 API 手动创建，再运行 DSK；按自然键识别，不重复创建。
4. **原位更新**：修改一种语言的文字，只有该记录更新，ID 保持不变，另一语言不受影响。
5. **幂等**：再次计划 / 应用全部 unchanged，不产生额外写入。
6. **只读计划**：dry-run 的写请求次数为零，并准确列出文字差异。
7. **重复实例记录**：用夹具或隔离实例构造重复自然键，明确报冲突，不任意选取。
8. **删除与保护**：源码移除不触发隐式删除；显式删除要求确认；其他项目及内置翻译不受影响。
9. **分页与失败恢复**：记录超过单页上限仍能匹配；权限不足和部分写入失败能生成明确报告，再次执行可恢复。
10. **Studio 实际交互**：同一个下拉字段切换中文 / 英文后显示不同文字，选择后保存的稳定 ID 不变；整数选项仍保存整数。
11. **特殊文字**：中文、英文、换行、标点及合法特殊字符回读一致，不被重复转义。
12. **已有资源回归**：roles、policies、access、permissions、presets、folders 的匹配、同步和删除确认行为不变。

真实集成测试优先使用隔离开发实例，不直接将测试数据写入其他项目正在使用的实例。支持的 Directus 版本范围须按实际测试证据说明。

## 8. 建议交付内容与优先级

第一阶段交付：公开 ResourceType / 类型、Manifest 校验、官方 API 适配、自然键匹配、dry-run / apply / 显式删除、错误报告、测试，以及完整的中英文下拉示例文档。

第二阶段再考虑翻译引用完整性检查和批量生成多语言 choices 的便捷 helper。第一阶段不需要增加机器翻译、业务内容多语言建模或新的独立命令体系。

另一个独立需求已整理为 [字段条件元数据更新支持](schema-kit-field-conditions-request.md)，包含 `meta.conditions` 更新被判 conflict 的原因、本项目实际场景、风险边界和验收标准。两项需求可分别实现与验收。

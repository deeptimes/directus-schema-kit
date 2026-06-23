# CLI 参考

## 全局参数

全局参数写在子命令前：

```bash
pnpm dsk [--cwd <path>] [--config <path>] [--format text|json] <command>
```

| 参数 | 说明 |
| --- | --- |
| `--cwd <path>` | Directus 项目或其子目录，默认当前目录 |
| `--config <path>` | 相对项目根目录的配置文件，默认 `dsk/config.json` |
| `--format text\|json` | 人工可读或机器可读输出，默认 `text` |
| `--version` | 输出安装的包版本 |

## 命令

| 命令 | 作用 | 是否连接实例 | 是否写入 |
| --- | --- | --- | --- |
| `init [--dry-run]` | 幂等初始化 `dsk/` 工作区 | 否 | 创建缺失文件 |
| `build [--check]` | 编译 DSL，生成或检查 Manifest | 否 | 默认写 Manifest |
| `validate` | 校验配置、Manifest、新鲜度和 seed | 否 | 否 |
| `doctor` | 诊断项目、版本、环境变量和工作区 | 否 | 否 |
| `plan` | 比较 Manifest 与 Directus 当前状态 | 是，只读 | 否 |
| `apply [--dry-run]` | 执行安全的 Schema 创建和更新 | 是 | 默认写入 |
| `seed [path] [--dry-run\|--plan]` | 校验、规划或幂等应用 seed | `--dry-run` 否，其余是 | 默认写入 |
| `resources apply [--dry-run] [--confirm-destructive]` | 同步系统资源 | 是 | 默认写入 |
| `clear [--dry-run] [--confirm]` | 规划或清理全部自定义 Schema | 是 | 需交互确认或 `--confirm` |

`build --check` 只检查现有 Manifest 是否最新。`seed --dry-run` 仅做本地结构校验；要查看实例上的 create/update/unchanged，使用 `seed --plan`。

## 推荐工作流

```bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply --dry-run
pnpm dsk apply
pnpm dsk plan
```

最后一次 `plan` 应没有可执行差异。CI 通常使用：

```bash
pnpm dsk build --check
pnpm dsk validate --format json
```

全局参数示例：`pnpm dsk --format json validate`。

## Plan 分类

| 分类 | 含义 | Apply 行为 |
| --- | --- | --- |
| `create` | 目标资源不存在 | 执行 |
| `update` | 仅包含安全白名单差异 | 执行 |
| `unchanged` | 已声明属性一致 | 跳过 |
| `conflict` | 存在非白名单差异 | 阻断全部写入 |
| `dangerous` | 类型、约束、关系目标或删除策略等高风险差异 | 阻断全部写入 |

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功，且没有阻断差异 |
| `2` | DSL 构建、Manifest 或数据校验失败 |
| `3` | 存在 conflict/dangerous，或操作缺少危险确认 |
| `4` | 连接或执行失败 |
| `5` | 配置或项目识别错误 |

JSON 输出只在 stdout 产生一个机器可读结果，不包含装饰性文本或凭证。

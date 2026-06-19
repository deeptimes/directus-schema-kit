# DSK 数据目录

- `config.json`：项目路径、安全和校验配置。
- `seeds/`：严格 JSON seed，每个文件必须包含 `schemaVersion`。
- `generated/manifest.json`：由 `dsk build` 生成，禁止手工修改。

`plan/apply` 仅消费 JSON Manifest，不执行 TypeScript DSL。

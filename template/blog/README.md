# IT Blog 模板

这是一套可复制到现有 `dsk/` 工作区的示例，目标版本为 Directus 11.17.4。

## 包含内容

- `blog.dbml`：完整数据关系图。
- `schemas/`：分类、标签、文章、会员、评论和下载资源。
- `resources/`：项目级 Public policy、Blog Member 权限与 role，以及媒体目录。
- `seeds/`：分类、标签和公开/会员文章示例。

## 使用

将本目录中的 `schemas/`、`resources/`、`seeds/` 合并复制到目标项目的 `dsk/` 目录，然后执行：

```bash
pnpm dsk build
pnpm dsk validate
pnpm dsk plan
pnpm dsk apply
pnpm dsk resources apply --dry-run
pnpm dsk resources apply
pnpm dsk seed --dry-run
pnpm dsk seed
```

执行顺序必须是 Schema、Resource、Seed。资源权限引用了 Schema collection，Seed 也依赖 collection 已创建。

## 账号与文件约定

- Public 表示未登录访客，不对应 `directus_users` 中的用户。
- `Project Public Policy` 是整个项目共享的匿名策略；后续 Docs 等模块应在各自的 `resources/permissions/*.ts` 中引用 `policies.project-public`，不要重复创建 Public policy。
- Member 是 `Blog Member` role 下的登录用户，可读取 `access_level = member` 的文章和下载资源；模板权限将下载文件限定为会员访问。
- 本模板不创建真实用户或密码。请在 Directus 中创建用户并分配 `Blog Member` role。
- 封面、视频和画廊文件上传到 `Blog Media` folder。
- 会员下载文件上传到 `Blog Downloads` folder。
- Seed 不包含二进制文件、用户、评论和 M2M 关联；这些内容需在 Directus 中补充。

权限规则用于开发和测试。生产使用前仍需根据实际前端查询、文件签名策略和会员到期逻辑进行安全审查。

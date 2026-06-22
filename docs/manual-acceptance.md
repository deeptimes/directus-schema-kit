# 人工验收清单

自动 CI 通过后，在真实项目执行一次：

1. `dsk init` 重复执行不会覆盖现有文件。
2. `dsk build && dsk validate` 成功，Manifest 无敏感值。
3. `dsk plan` 输出符合预期，首次 apply 后第二次 plan 无可执行差异。
4. `dsk seed --plan` 数量正确，执行 seed 后再次 plan 全部 unchanged。
5. `dsk resources apply --dry-run` 与 Directus 后台显示一致。
6. 在交互式终端执行 `clear` 时先输出全部自定义 Schema 的完整计划，回车或输入 `n` 不产生删除。
7. 在一次性本地实例确认 `clear` 输入 `y` 后清理全部自定义集合；非交互执行 `clear --confirm` 具有相同范围。
8. 在 Data Studio 分别确认 Markdown、Tags、Code、Toggle 的创建和编辑界面。
9. 确认 M2O/O2M/M2M/M2A/Translations/File/Image/Files 的选择、编辑和展示；Image 默认只接受图片 MIME 类型。

人工验收关注 CLI 可读性和 Directus 后台 UI 结果，不替代自动化测试。

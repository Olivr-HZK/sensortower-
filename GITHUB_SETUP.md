# GitHub 推送指南

## 步骤 1：在 GitHub 上创建新仓库

1. 访问 https://github.com/new
2. 填写仓库名称（例如：`sensortower`）
3. 选择 Public 或 Private
4. **不要**勾选 "Initialize this repository with a README"
5. 点击 "Create repository"

## 步骤 2：添加远程仓库并推送

在终端中运行以下命令（将 `YOUR_USERNAME` 和 `YOUR_REPO_NAME` 替换为你的实际信息）：

```bash
# 添加远程仓库
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 或者使用 SSH（如果已配置 SSH key）
# git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 步骤 3：验证推送

访问你的 GitHub 仓库页面，确认代码已成功推送。

## 注意事项

- 确保 `.env` 文件不会被提交（已在 `.gitignore` 中）
- 数据库文件（`.db`）不会被提交
- `node_modules/` 不会被提交

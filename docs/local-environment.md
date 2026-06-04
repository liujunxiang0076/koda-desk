# 本地环境规则

## 何时读取

当任务需要运行命令、改 shell 配置、查路径、文件搜索、环境变量、Homebrew、Ghostty、安装命令行工具或操作终端配置时，先读取本文件。

## 环境假设

- 当前环境按 **macOS 原生环境 + Ghostty + zsh** 处理。
- 不要默认使用 Windows、PowerShell、Linux 发行版专属命令或 GNU coreutils 特有行为。
- 不把 Windows PowerShell 命令或 Linux 发行版专属命令直接搬到 macOS zsh / Ghostty 中运行。

## 命令执行

- 执行命令前，简要说明命令目的。
- 命令失败时，报告执行了什么命令、关键错误信息、下一步修复方案。
- 不默认修改 `~/.zshenv`。

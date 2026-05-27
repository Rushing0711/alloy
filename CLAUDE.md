# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 仓库用途

这是一个 AI 编码辅助框架的对比分析项目，对比对象为 **OpenSpec**（Fission-AI 开发）和 **Superpowers**（obra 开发）。核心文件为 `hybird.md`——详细对比了两者的命令面、工作流、优缺点及互补关系。

## 核心概念

- **OpenSpec** 专长于 spec 驱动的变更追踪：Delta Spec（ADDED/MODIFIED/REMOVED）、结构化工件（proposal、design、tasks）和可审计归档。核心问题是"构建什么以及改了什么"。
- **Superpowers** 专长于流程纪律：brainstorming 闸门、TDD 强制执行、系统化调试、verification-before-completion、code review 工作流。核心问题是"如何高质量地构建"。
- 两者是互补关系，不是替代关系。混合方案是用 OpenSpec 管理需求和变更追踪，用 Superpowers 的流程闸门增强执行纪律。

## 文件结构

- `hybird.md` — 主对比文档（OpenSpec vs Superpowers）。包含命令参考、双方官方文档精要，以及两者的互补性分析。当前唯一的内容文件。

# Skills 更新日志 - 2025-02-03

## 📊 安装统计

- **SKILL.md 文件总数**: 64 个
- **Skills 目录总数**: 41 个
- **新增来源**: obra/superpowers + obra/superpowers-skills

## 🆕 新增的 Superpowers Skills

### 🤝 协作与开发流程 (Collaboration)

1. **brainstorming** ⭐️
   - 在任何创意工作前必须使用
   - 探索用户意图、需求和设计
   - 实施前的规划工具

2. **dispatching-parallel-agents**
   - 处理2个以上独立任务
   - 无共享状态或顺序依赖的场景

3. **executing-plans**
   - 执行已编写的实现计划
   - 带有审查检查点的独立会话

4. **finishing-a-development-branch**
   - 实现完成后使用
   - 所有测试通过时
   - 决定如何集成工作（merge、PR、cleanup）

5. **receiving-code-review**
   - 接收代码审查反馈时使用
   - 实施建议前
   - 需要技术严谨性和验证

6. **requesting-code-review**
   - 完成任务时使用
   - 实现主要功能后
   - 合并前验证工作

7. **subagent-driven-development** ⭐️
   - 在当前会话中执行实现计划
   - 处理独立任务

8. **using-git-worktrees**
   - 开始需要隔离的功能工作
   - 执行实现计划前
   - 智能目录选择和安全验证

9. **writing-plans** ⭐️
   - 有规范或多步骤任务需求时
   - 触摸代码前使用

10. **remembering-conversations**
    - 跨会话记忆和上下文保持

### 🐛 调试与验证 (Debugging)

11. **systematic-debugging** ⭐️
    - 遇到任何 bug、测试失败或意外行为时
    - 提出修复前使用

12. **verification-before-completion** ⭐️
    - 声称工作完成、修复或通过前
    - 提交或创建 PR 前
    - 运行验证命令并确认输出

13. **defense-in-depth**
    - 深度防御策略
    - 多层验证

14. **root-cause-tracing**
    - 根因追踪
    - 问题溯源

### 🧪 测试 (Testing)

15. **test-driven-development** ⭐️
    - 实现任何功能或 bugfix 前
    - 编写实现代码前使用

### 🏗️ 架构 (Architecture)

16. **preserving-productive-tensions**
    - 保持产品张力
    - 架构决策平衡

### 🔍 问题解决 (Problem Solving)

包含多个问题解决相关的 skills

### 🔬 研究 (Research)

包含研究相关的 skills

### 🎓 元技能 (Meta)

17. **using-superpowers** ⭐️
    - 开始任何对话时使用
    - 建立如何查找和使用 skills
    - 需要在任何响应前调用 Skill 工具

18. **using-skills**
    - Skills wiki 介绍
    - 必须的工作流程
    - 搜索工具
    - 头脑风暴触发器

19. **writing-skills**
    - 创建新 skills 时使用
    - 编辑现有 skills
    - 部署前验证 skills 工作

## 🎯 重点推荐使用

### 开发工作流必备

1. **brainstorming** - 任何功能开发前
2. **writing-plans** - 多步骤任务规划
3. **test-driven-development** - TDD 开发
4. **systematic-debugging** - 遇到问题时
5. **verification-before-completion** - 完成前验证

### 协作必备

6. **requesting-code-review** - 请求审查
7. **receiving-code-review** - 接收反馈
8. **using-git-worktrees** - 功能分支管理

### 高级工作流

9. **subagent-driven-development** - 子代理开发
10. **dispatching-parallel-agents** - 并行任务处理
11. **executing-plans** - 计划执行

## 📁 Skills 组织结构

```
.claude/skills/
├── 官方 Anthropic Skills (19个)
│   ├── 文档处理: docx, pdf, pptx, xlsx
│   ├── 创意设计: algorithmic-art, canvas-design, theme-factory
│   ├── 开发工具: frontend-design, web-artifacts-builder, mcp-builder
│   └── 其他: skill-creator, internal-comms, etc.
│
├── Superpowers Core (14个)
│   ├── brainstorming
│   ├── writing-plans
│   ├── executing-plans
│   ├── test-driven-development
│   ├── systematic-debugging
│   └── ...
│
└── Superpowers-Skills (31个)
    ├── collaboration/ (10个)
    ├── debugging/ (4个)
    ├── testing/ (多个)
    ├── architecture/ (1个)
    ├── problem-solving/ (多个)
    ├── research/ (多个)
    └── meta/ (多个)
```

## 🔄 与现有 Skills 的关系

### 重复的 Skills

一些 skills 在 superpowers 和 superpowers-skills 中都存在：
- brainstorming
- systematic-debugging
- test-driven-development
- using-git-worktrees
- writing-plans

这些重复是正常的，系统会自动处理。

### 互补关系

- **SpecKit** (项目管理) + **Superpowers** (开发流程) = 完整开发生命周期
- **Official Skills** (文档/设计) + **Superpowers** (开发/协作) = 全方位能力

## 💡 使用建议

### 典型开发流程

```
1. brainstorming           → 理解需求
2. writing-plans           → 制定计划
3. using-git-worktrees     → 创建隔离环境
4. test-driven-development → 编写测试
5. [实现代码]               → 开发
6. systematic-debugging     → 调试问题
7. verification-before-completion → 验证完成
8. requesting-code-review   → 请求审查
9. finishing-a-development-branch → 完成并集成
```

### 多任务并行

```
1. writing-plans                → 制定总体计划
2. dispatching-parallel-agents  → 分配并行任务
3. [并行执行]                    → 多个 agents 工作
4. verification-before-completion → 验证结果
```

## 📚 相关文档

- [Skills 清单](./SKILLS_INVENTORY.md) - 官方 skills 详细列表
- [Awesome Skills 目录](./AWESOME_SKILLS_CATALOG.md) - 社区资源
- [社区 Skills 安装指南](./COMMUNITY_SKILLS_INSTALL.md) - 安装说明

## 🔗 参考资源

- [obra/superpowers](https://github.com/obra/superpowers)
- [obra/superpowers-skills](https://github.com/obra/superpowers-skills)
- [Blog: Superpowers](https://blog.fsck.com/2025/10/09/superpowers/)

---

**安装时间**: 2025-02-03
**安装方式**: Git clone + 目录复制
**下一步**: 开始使用这些强大的 skills 提升开发效率！

# Awesome Claude Skills 目录

基于 [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) 精选列表

## 📖 关于此目录

这是一个精选的 Claude Skills 资源目录，包含官方和社区贡献的 skills。

### 已安装的 Skills

查看 [SKILLS_INVENTORY.md](./SKILLS_INVENTORY.md) 了解已安装的 skills 列表。

## 🌟 推荐的社区 Skills 集合

### 1. [obra/superpowers](https://github.com/obra/superpowers)
**核心技能库 - 20+ 个经过实战检验的技能**

功能特性：
- `/brainstorm` - 头脑风暴命令
- `/write-plan` - 编写计划
- `/execute-plan` - 执行计划
- skills-search 工具
- TDD 模式
- 调试模式
- 协作模式

安装方法：
```bash
# Claude Code
/plugin marketplace add obra/superpowers-marketplace
```

相关资源：
- [superpowers-skills](https://github.com/obra/superpowers-skills) - 社区可编辑的 skills 仓库
- [Blog: Superpowers](https://blog.fsck.com/2025/10/09/superpowers/) - 作者概览

### 2. [obra/superpowers-lab](https://github.com/obra/superpowers-lab)
**实验性技能**

- 使用新技术的实验性 skills
- 技能可能会随时间变化
- [开发博客](https://blog.fsck.com/2025/10/23/naming-claude-plugins/)

### 3. [claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills)
**科学计算技能集合**

- 专业科学库支持
- 数据库集成
- 科研工作流

## 🎯 推荐的独立 Skills

### iOS 开发
**[ios-simulator-skill](https://github.com/conorluddy/ios-simulator-skill)**
- iOS 应用构建
- 导航和测试
- 自动化支持

### 安全测试
**[ffuf-web-fuzzing](https://github.com/jthack/ffuf_claude_skill)**
- Web fuzzing 专家指导
- 渗透测试
- 认证 fuzzing
- 结果分析

**[Trail of Bits Security Skills](https://github.com/trailofbits/skills)**
- CodeQL/Semgrep 静态分析
- 变体分析
- 代码审计
- 漏洞检测

### 浏览器自动化
**[playwright-skill](https://github.com/lackeyjb/playwright-skill)**
- 通用浏览器自动化
- Playwright 集成

### 数据可视化
**[claude-d3js-skill](https://github.com/chrisvoncsefalvay/claude-d3js-skill)**
- d3.js 可视化
- 交互式图表

### Web 资源
**[web-asset-generator](https://github.com/alonw0/web-asset-generator)**
- 生成 favicons
- 应用图标
- 社交媒体图片

### 创业自动化
**[loki-mode](https://github.com/asklokesh/claudeskill-loki-mode)**
- 多智能体自主启动系统
- 编排 37 个 AI 代理
- 6 个群组协作
- 从 PRD 到收入的完整流程

## 🛠️ 工具

### [Skill_Seekers](https://github.com/yusufkaraaslan/Skill_Seekers)
**文档网站转 Skills 工具**

将文档网站转换为 Claude Skills

## 📥 如何安装社区 Skills

### 方法 1: 直接克隆仓库

```bash
# 克隆 skill 仓库
git clone https://github.com/[author]/[skill-name].git /tmp/skill

# 复制到项目
cp -r /tmp/skill/.claude/skills/* .claude/skills/

# 或者复制单个 skill
cp -r /tmp/skill/* .claude/skills/skill-name/
```

### 方法 2: 使用 Claude Code Plugin

```bash
# 如果 skill 在 marketplace 中
/plugin install skill-name@marketplace-name
```

### 方法 3: 手动下载

1. 访问 GitHub 仓库
2. 下载 SKILL.md 和相关文件
3. 创建对应的文件夹结构
4. 放置到 `.claude/skills/` 目录

## ⚠️ 安全注意事项

**重要**: Skills 可以在 Claude 环境中执行任意代码。仅从可信来源安装 skills。

### 安全检查清单

- [ ] 仅从可信来源安装
- [ ] 查看 SKILL.md 和所有脚本
- [ ] 注意敏感数据访问请求
- [ ] 在生产环境部署前仔细审计

### 安全资源

- [Weaponizing Claude Code Skills](https://medium.com/@yossifqassim/weaponizing-claude-code-skills-from-5-5-to-remote-shell-a14af2d109c9) - 潜在安全风险分析

## 📚 学习资源

### 官方文档

- [什么是 Skills?](https://support.claude.com/en/articles/12512176-what-are-skills)
- [使用 Skills](https://support.claude.com/en/articles/12512180-using-skills-in-claude)
- [Skills API 文档](https://platform.claude.com/docs/en/api/beta/skills)

### 教程

- [创建第一个 Claude Skill](https://skywork.ai/blog/ai-agent/how-to-create-claude-skill-step-by-step-guide/)
- [在 Claude Code 中使用 Skills](https://skywork.ai/blog/how-to-use-skills-in-claude-code-install-path-project-scoping-testing/)

### 博客文章

- [Skills Explained](https://claude.com/blog/skills-explained) - 官方详细说明
- [Simon Willison: Claude Skills 分析](https://simonwillison.net/2025/Oct/16/claude-skills/)

## 🆚 Skills vs 其他工具

### 快速参考

| 工具 | 最适用场景 |
|------|----------|
| **Skills** | 跨对话的可重用程序知识 |
| **Prompts** | 一次性指令和即时上下文 |
| **Projects** | 工作区内的持久背景知识 |
| **Subagents** | 具有特定权限的独立任务执行 |
| **MCP** | 连接 Claude 到外部数据源 |

### Skills vs MCP

| 功能 | Skills | MCP |
|------|--------|-----|
| **用途** | 任务特定的专业知识和工作流 | 外部数据/API 集成 |
| **可移植性** | 统一格式（Claude.ai、Code、API） | 需要服务器配置 |
| **代码执行** | 可包含可执行脚本 | 提供工具/资源 |
| **Token 效率** | 30-50 tokens 直到加载 | 因实现而异 |
| **最适合** | 可重复任务、文档工作流 | 数据库访问、API 集成 |

## 🤝 贡献

想添加新的 skill 或资源？

1. Fork [awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills)
2. 添加到适当的部分
3. 提交 PR

## 📅 更新日志

### 2025年11月
- **11月13日**: Anthropic 发布 [Skills Explained](https://claude.com/blog/skills-explained)

### 2025年10月
- **10月18日**: obra/superpowers 技能库发布
- **10月16日**: 🎉 **Claude Skills 正式发布**

## 🔗 相关链接

- [Anthropic Skills 官方仓库](https://github.com/anthropics/skills)
- [Claude Cookbooks - Skills](https://github.com/anthropics/claude-cookbooks/tree/main/skills)
- [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills)
- [Agent Skills 标准](http://agentskills.io)

---

**下一步**: 根据需要从上面的列表中选择并安装社区 skills。

推荐优先安装：
1. **obra/superpowers** - 如果需要高级开发工作流
2. **playwright-skill** - 如果需要浏览器自动化
3. **claude-scientific-skills** - 如果需要科学计算

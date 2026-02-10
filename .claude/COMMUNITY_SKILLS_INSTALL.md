# 社区 Skills 安装指南

由于网络连接问题，无法自动安装社区 skills。请按照以下步骤手动安装。

## 🌟 推荐安装: obra/superpowers

### 什么是 Superpowers?

Superpowers 是一个核心技能库，包含 20+ 个经过实战检验的开发技能，由 Jesse Vincent 创建。

**主要功能：**
- `/brainstorm` - 头脑风暴命令
- `/write-plan` - 编写实现计划
- `/execute-plan` - 执行计划
- TDD（测试驱动开发）模式
- 调试和协作模式
- skills-search 工具

### 安装方法

#### 方法 1: 使用 Claude Code Plugin Marketplace（推荐）

```bash
# 在 Claude Code 中运行
/plugin marketplace add obra/superpowers-marketplace

# 安装 superpowers
/plugin install superpowers@obra-superpowers-marketplace

# 安装 superpowers-lab（实验性技能）
/plugin install superpowers-lab@obra-superpowers-marketplace
```

#### 方法 2: 手动从 GitHub 安装

1. **克隆仓库**
   ```bash
   cd /tmp
   git clone https://github.com/obra/superpowers.git
   git clone https://github.com/obra/superpowers-skills.git
   git clone https://github.com/obra/superpowers-lab.git
   ```

2. **复制 skills 到项目**
   ```bash
   cd d:/code/Description

   # 复制 superpowers skills
   cp -r /tmp/superpowers-skills/.claude/skills/* .claude/skills/

   # 复制 superpowers-lab skills
   cp -r /tmp/superpowers-lab/.claude/skills/* .claude/skills/
   ```

3. **验证安装**
   ```bash
   ls .claude/skills/
   ```

#### 方法 3: 直接下载 ZIP

如果 git clone 失败，可以直接从 GitHub 下载 ZIP：

1. 访问 https://github.com/obra/superpowers-skills
2. 点击绿色的 "Code" 按钮
3. 选择 "Download ZIP"
4. 解压缩文件
5. 将 `.claude/skills/` 目录下的内容复制到本项目的 `.claude/skills/` 目录

## 🎯 其他推荐的社区 Skills

### 1. Playwright Skill（浏览器自动化）

```bash
cd /tmp
git clone https://github.com/lackeyjb/playwright-skill.git
cp -r playwright-skill/* d:/code/Description/.claude/skills/playwright-skill/
```

或访问: https://github.com/lackeyjb/playwright-skill

### 2. D3.js Visualization

```bash
cd /tmp
git clone https://github.com/chrisvoncsefalvay/claude-d3js-skill.git
cp -r claude-d3js-skill/* d:/code/Description/.claude/skills/claude-d3js-skill/
```

或访问: https://github.com/chrisvoncsefalvay/claude-d3js-skill

### 3. Scientific Computing Skills

```bash
cd /tmp
git clone https://github.com/K-Dense-AI/claude-scientific-skills.git
cp -r claude-scientific-skills/.claude/skills/* d:/code/Description/.claude/skills/
```

或访问: https://github.com/K-Dense-AI/claude-scientific-skills

### 4. Web Asset Generator

```bash
cd /tmp
git clone https://github.com/alonw0/web-asset-generator.git
cp -r web-asset-generator/* d:/code/Description/.claude/skills/web-asset-generator/
```

或访问: https://github.com/alonw0/web-asset-generator

### 5. iOS Simulator Skill

```bash
cd /tmp
git clone https://github.com/conorluddy/ios-simulator-skill.git
cp -r ios-simulator-skill/* d:/code/Description/.claude/skills/ios-simulator-skill/
```

或访问: https://github.com/conorluddy/ios-simulator-skill

### 6. Security Skills（Trail of Bits）

```bash
cd /tmp
git clone https://github.com/trailofbits/skills.git trailofbits-skills
cp -r trailofbits-skills/.claude/skills/* d:/code/Description/.claude/skills/
```

或访问: https://github.com/trailofbits/skills

### 7. FFUF Web Fuzzing（安全测试）

```bash
cd /tmp
git clone https://github.com/jthack/ffuf_claude_skill.git
cp -r ffuf_claude_skill/* d:/code/Description/.claude/skills/ffuf-web-fuzzing/
```

或访问: https://github.com/jthack/ffuf_claude_skill

## 📋 安装后检查清单

安装完新的 skills 后，执行以下检查：

1. **验证文件结构**
   ```bash
   # 每个 skill 应该有 SKILL.md 文件
   find .claude/skills/ -name "SKILL.md" -type f
   ```

2. **检查 YAML frontmatter**
   ```bash
   # 查看 skill 的元数据
   head -20 .claude/skills/skill-name/SKILL.md
   ```

3. **重启 Claude Code/Desktop**（如果使用）
   - 重启应用以加载新的 skills

4. **测试 skill**
   - 在对话中提及 skill 的功能
   - Claude 应该自动识别并加载相应的 skill

## 🔍 验证安装

安装完成后，可以通过以下方式验证：

```bash
# 统计已安装的 skills 数量
ls -d .claude/skills/*/ | wc -l

# 列出所有 skills
ls -d .claude/skills/*/ | xargs -I {} basename {}

# 查看特定 skill 的描述
grep "description:" .claude/skills/skill-name/SKILL.md
```

## ⚠️ 故障排除

### 问题：Skills 未显示

**解决方案：**
1. 确保 SKILL.md 文件格式正确
2. 检查 YAML frontmatter 是否有 `name` 和 `description` 字段
3. 重启 Claude 应用

### 问题：Scripts 执行失败

**解决方案：**
1. 检查脚本依赖是否已安装
2. 验证脚本权限（Linux/Mac）
3. 查看错误日志

### 问题：Git clone 失败

**解决方案：**
1. 检查网络连接
2. 配置 Git 代理（如果需要）：
   ```bash
   git config --global http.proxy http://127.0.0.1:7897
   git config --global https.proxy http://127.0.0.1:7897
   ```
3. 使用 ZIP 下载替代方案

## 📚 更多资源

- [Awesome Claude Skills 目录](./AWESOME_SKILLS_CATALOG.md)
- [已安装 Skills 清单](./SKILLS_INVENTORY.md)
- [官方 Skills 文档](https://support.claude.com/en/articles/12512180-using-skills-in-claude)

## 💡 提示

- **优先级**: 先安装最常用的 skills
- **测试**: 在非生产环境中测试新 skills
- **审查**: 安装前仔细审查 skill 的代码
- **版本控制**: 使用 git 管理自定义 skills

---

**需要帮助？** 查看各个仓库的 README 或在 GitHub Issues 中提问。

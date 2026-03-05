name: remotion
description: 动画逻辑图工厂。用户描述想要的动画（ASCII 草图或文字），自动生成 Remotion 代码并渲染为 GIF。当用户提到动画、逻辑图、GIF、Remotion 时触发。

### 核心工作流

"检测环境 → 用户描述 → 匹配现有模板 → 适配/新建 → 注册 → 渲染 GIF → 导出"

**核心原则：优先复用现有模板，不要从零新建。**

用户无需搭建环境或了解代码，Skill 包含完整运行环境。

### 目录结构

```
skills/remotion/
├── SKILL.md
├── package.json
├── tsconfig.json
├── node_modules/
├── src/
│   └── index.tsx
├── 案例库/
│   ├── 循环流程图/
│   ├── 莫兰迪卡片网格/
│   ├── 可爱流程图/
│   ├── 对比流程图/
│   ├── 技能流程图/
│   ├── 终端流程图/
│   ├── 人物卡片/
│   ├── 时间线/
│   ├── 代码展示/
│   └── 饼图/
├── 脚本库/
└── 设计规范/
```

### 执行步骤

**Step 1: 检测Remotion环境** — 验证 `skills/remotion/` 目录状态，若缺失则克隆仓库并执行 `npm install`。

**Step 2: 理解用户需求** — 接收ASCII草图、文字描述或参考案例。

**Step 3: 匹配现有模板（优先级最高）** — 浏览案例库，按匹配度判断：高匹配直接修改内容，中匹配调整布局，无匹配才新建。

**Step 4: 生成/适配组件代码**

规范要点:
- 画布：800×600
- fps：30
- 使用 `spring()` 实现弹性效果
- 动画末尾留60帧缓冲
- 字体：PingFang SC/Microsoft YaHei

必需导入:
```tsx
import { useCurrentFrame, useVideoConfig, interpolate,
         AbsoluteFill, spring } from 'remotion';
```

**Step 5: 注册Composition** — 在 `src/index.tsx` 添加新组件注册。

**Step 6: 渲染GIF**
```
npx remotion render src/index.tsx [id] [路径] --codec=gif
```
使用 `--every-nth-frame=2` 获得15fps的最佳体积与流畅度平衡。

### 设计规范速查

| 项目 | 默认值 |
|------|--------|
| 画布 | 800×600 |
| fps | 30 |
| 背景 | #fff 或 #f5f0eb |
| 入场间隔 | 30-40帧/元素 |
| 缓冲 | 60帧 |
| 弹性动画 | spring({damping: 8-12}) |
| 节点圆角 | 50%或20px |

### 触发条件

当用户提及动画逻辑图、GIF配图、Remotion渲染或ASCII转动画时激活。

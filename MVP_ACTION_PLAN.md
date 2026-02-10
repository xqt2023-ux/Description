# MVP 实施行动计划

**项目名称**: AI驱动的视频编辑器  
**创建日期**: 2026-02-10  
**团队规模**: 1-2人  
**目标周期**: 1个月可用MVP  
**商业模式**: Freemium（基础免费，高级功能付费）

---

## 📋 需求确认总结

### 核心定位
**"降低门槛的 AI 驱动视频编辑工具"**

### 目标场景
1. 🎓 **在线课程制作**：自动字幕、章节、知识点标注
2. 📱 **短视频创作**：快速剪辑发布（抖音、B站、小红书）

### 核心痛点
- ❌ 传统视频编辑工具太专业，学习曲线陡
- ❌ 视频剪辑太费时间
- ✅ 需要AI辅助：自动转录、智能剪辑、一键生成字幕章节

### 当前优势
- ✅ 已实现 65-70% 核心功能
- ✅ 文本驱动编辑流程完整
- ✅ AI 转录和增强功能强大
- ✅ Underlord AI 助手已就绪

---

## 🎯 MVP 策略：快速验证型（方案A）

### 战略选择
**先做编辑器MVP，暂缓录制功能**

**理由**：
1. 快速上线，验证市场需求（1个月 vs 3个月）
2. 用户可以用OBS/手机拍摄，然后用你的工具编辑
3. 聚焦差异化：AI功能 > 录制功能
4. 降低技术风险和时间成本

### 技术选型
- **转录服务**：Groq Whisper（免费，先用着）
- **字幕编辑器**：基础版（字体、颜色、位置）
- **模板系统**：简单版（5-10个硬编码模板）

### 商业模式
**Freemium - 免费增值**

| 功能 | 免费版 | 付费版（¥49/月） |
|------|--------|-----------------|
| 项目数量 | 每月5个 | 无限 |
| 转录服务 | Groq（基础） | OpenAI（高级） |
| 视频时长 | 最长15分钟 | 无限制 |
| 导出质量 | 720p + 水印 | 4K 无水印 |
| AI功能 | 基础（字幕、章节） | 高级（语音克隆、智能剪辑） |
| 字幕样式 | 3种预设 | 50+ 模板 |
| 导出次数 | 每月10次 | 无限 |
| 客服支持 | 社区 | 优先响应 |

---

## 📅 4周冲刺计划

### Week 1：字幕系统完善 ⭐
**目标**：让字幕编辑器达到可用状态

#### 任务清单
- [ ] **Day 1-2：字幕样式编辑器（基础版）**
  - 文件：`frontend/src/components/editor/SubtitleEditor.tsx`
  - 功能：
    - ✅ 字体选择（系统字体 + 3种网络字体）
    - ✅ 字号调整（16-72px）
    - ✅ 颜色选择（文字颜色 + 背景颜色）
    - ✅ 位置设置（顶部、中部、底部）
    - ✅ 描边和阴影
  - 技术：React + Tailwind CSS
  
- [ ] **Day 3-4：字幕实时预览**
  - 集成到 `VideoPlayer.tsx`
  - 支持时间轴拖拽调整字幕时间
  - 字幕淡入淡出动画（CSS transition）
  
- [ ] **Day 5：字幕导出到视频**
  - 文件：`backend/src/services/subtitleBurning.ts`
  - 使用 FFmpeg drawtext 滤镜
  - 支持中文字体（确保服务器有字体文件）
  
```typescript
// 示例：FFmpeg 字幕烧录
const subtitleFilter = `drawtext=fontfile=/path/to/font.ttf:text='${text}':fontcolor=${color}:fontsize=${size}:x=(w-text_w)/2:y=h-${position}`;
```

#### 验收标准
- ✅ 用户可以在编辑器中设置字幕样式
- ✅ 预览窗口实时显示效果
- ✅ 导出视频包含烧录的字幕

---

### Week 2：模板系统和UI优化 ⭐⭐
**目标**：提供开箱即用的体验

#### 任务清单
- [ ] **Day 1-2：创建模板数据结构**
  - 文件：`shared/types/templates.ts`
  - 定义模板Schema
  
```typescript
export interface VideoTemplate {
  id: string;
  name: string;
  category: 'course' | 'short-video' | 'podcast';
  thumbnail: string;
  description: string;
  subtitleStyle: SubtitleStyle;
  exportSettings: ExportOptions;
  // 课程模板特有
  chapterMarkers?: boolean;
  knowledgePoints?: boolean;
}
```

- [ ] **Day 3：创建10个硬编码模板**
  - 在线课程模板 x 4
    - "技术教程"：黑底白字，代码风格
    - "知识分享"：彩色字幕，活泼风格
    - "PPT讲解"：简洁字幕，专业风格
    - "语言学习"：大字号，高对比度
  
  - 短视频模板 x 4
    - "抖音竖屏"（9:16）：醒目字幕，快节奏
    - "B站横屏"（16:9）：弹幕风格
    - "小红书"（3:4）：美妆风格
    - "快手"（9:16）：接地气风格
  
  - 播客/访谈模板 x 2
    - "单人播客"：说话人名字 + 字幕
    - "双人对谈"：左右分屏字幕

- [ ] **Day 4-5：UI/UX 优化**
  - 首页引导流程
  - 添加 Demo 视频（30秒展示核心功能）
  - 空状态设计
  - 加载骨架屏
  - 错误提示友好化

#### 验收标准
- ✅ 新用户进入可以快速选择模板开始
- ✅ UI 美观专业，无明显 Bug
- ✅ 有清晰的新手引导

---

### Week 3：性能优化和稳定性 ⭐⭐⭐
**目标**：确保产品可靠运行

#### 任务清单
- [ ] **Day 1-2：性能优化**
  
  **前端优化**：
  - 时间线虚拟滚动（大量轨道时性能）
  - 视频预加载和缓存
  - 懒加载组件（React.lazy）
  - 图片/缩略图压缩
  
  **后端优化**：
  - FFmpeg 并发控制（避免服务器过载）
  - 转录任务队列优化
  - 导出进度实时推送（WebSocket 或 SSE）
  - 文件上传分片（支持大文件）

```typescript
// backend/src/services/taskQueue.ts
class TaskQueue {
  private maxConcurrency = 3; // 最多3个并发FFmpeg任务
  private queue: Task[] = [];
  
  async enqueue(task: Task): Promise<void> {
    // 队列管理逻辑
  }
}
```

- [ ] **Day 3：错误处理完善**
  - 统一错误码和错误信息
  - 友好的错误提示（而不是技术错误）
  - 重试机制（转录失败、导出失败）
  - 日志系统（便于排查问题）

- [ ] **Day 4-5：端到端测试**
  - Playwright E2E 测试关键流程
  - 上传 → 转录 → 编辑 → 导出
  - 不同浏览器测试（Chrome、Safari、Firefox）
  - 移动端适配测试

#### 验收标准
- ✅ 页面加载 < 2s
- ✅ 视频导出速度接近实时（1x速度）
- ✅ 错误有清晰提示和解决建议
- ✅ 关键流程 E2E 测试通过

---

### Week 4：付费功能基础设施 ⭐⭐⭐⭐
**目标**：为 Freemium 模式搭建基础

#### 任务清单
- [ ] **Day 1-2：用户系统**
  - 文件：`backend/src/services/auth.ts`
  - 简单的邮箱注册/登录（或集成第三方登录）
  - JWT Token 认证
  - 用户信息存储（PostgreSQL 或 MongoDB）

```typescript
// shared/types/user.ts
export interface User {
  id: string;
  email: string;
  plan: 'free' | 'pro';
  limits: {
    projectsPerMonth: number;
    videoLengthLimit: number; // 秒
    exportsPerMonth: number;
  };
  usage: {
    projectsThisMonth: number;
    exportsThisMonth: number;
  };
  createdAt: string;
  proExpiresAt?: string; // 付费到期时间
}
```

- [ ] **Day 3：配额限制系统**
  - 中间件：检查用户配额
  - 免费用户限制逻辑
  - 使用量统计

```typescript
// backend/src/middleware/checkLimits.ts
export async function checkProjectLimit(req, res, next) {
  const user = req.user;
  if (user.plan === 'free' && user.usage.projectsThisMonth >= 5) {
    return res.status(403).json({
      error: 'LIMIT_REACHED',
      message: '免费用户每月限5个项目，升级Pro解锁无限制',
      upgradeUrl: '/pricing'
    });
  }
  next();
}
```

- [ ] **Day 4：水印系统**
  - 免费用户导出视频自动添加水印
  - FFmpeg overlay 滤镜
  - 位置：右下角，半透明

- [ ] **Day 5：定价页面**
  - `frontend/src/app/pricing/page.tsx`
  - 清晰的免费 vs 付费功能对比
  - 升级按钮（先做UI，暂不接支付）

#### 验收标准
- ✅ 用户可以注册登录
- ✅ 免费用户受到配额限制
- ✅ 免费导出视频有水印
- ✅ 有完整的定价页面

---

## 🚀 发布准备清单

### 技术准备
- [ ] **服务器部署**
  - 前端：Vercel / Netlify（推荐）
  - 后端：云服务器（阿里云/腾讯云）或 Railway
  - 数据库：PostgreSQL（Supabase 免费版）
  - 文件存储：对象存储（阿里云OSS/腾讯云COS）

- [ ] **域名和SSL**
  - 购买域名（如 aivideoeditor.com）
  - 配置 SSL 证书

- [ ] **监控和分析**
  - Google Analytics 或 Umami（开源）
  - Sentry（错误追踪）
  - 服务器监控（CPU、内存、磁盘）

### 内容准备
- [ ] **Demo 视频**（重要！）
  - 30秒产品演示
  - 展示核心价值：上传 → AI转录 → 文本编辑 → 导出
  - 放在首页和社交媒体

- [ ] **帮助文档**
  - 快速开始指南
  - 常见问题 FAQ
  - 视频教程

- [ ] **营销素材**
  - 产品截图
  - 功能 GIF 动图
  - 用户场景描述

---

## 📊 MVP 成功指标

### 第1个月目标
- [ ] ✅ 产品可用并上线
- [ ] 👥 获得 **50-100个注册用户**
- [ ] 🎬 用户创建 **100+个项目**
- [ ] 📥 用户导出 **50+个视频**
- [ ] 💬 收集 **10+份用户反馈**

### 关键指标跟踪
- **激活率**：注册后创建项目的比例（目标 >50%）
- **留存率**：7日留存（目标 >30%）
- **完成率**：上传到导出的完成比例（目标 >40%）
- **付费转化**：免费到付费转化率（等积累用户后再看）

---

## 🎯 差异化策略

### 相比 Descript 的优势
1. **🇨🇳 中文优化**
   - 针对中文口音的转录优化
   - 专业术语词典（可让用户添加）
   - 中文分词优化

2. **🎓 课程场景深化**
   - 知识点自动标注（AI识别概念、定义）
   - 思维导图生成
   - 学习进度标记

3. **💡 更智能的AI交互**
   - 自然语言编辑："帮我把所有停顿超过3秒的地方剪掉"
   - 内容建议："这段讲得不够清晰，建议重录"
   - SEO优化："生成适合搜索的标题和描述"

4. **💰 价格优势**
   - Descript: $12-24/月（约¥85-170）
   - 你的产品: ¥49/月
   - 性价比更高

---

## 🔄 迭代计划（Post-MVP）

### 第2个月：根据反馈优化
- 修复 Bug
- 优化性能
- 完善最受欢迎的功能

### 第3个月：添加关键功能
基于用户反馈，选择性添加：
- [ ] 屏幕录制（如果需求强烈）
- [ ] 协作功能（如果有团队用户）
- [ ] 更多AI功能（语音克隆、智能剪辑）

### 第4-6个月：商业化
- 接入支付系统（微信、支付宝）
- 优化付费转化漏斗
- 营销推广

---

## 💡 风险和应对

### 风险1：用户不买单
**信号**：注册用户多，但没人升级付费

**应对**：
- 调研用户：为什么不愿意付费？
- 可能原因：
  - 免费版功能太够用 → 收紧免费配额
  - 付费功能不够吸引 → 增加杀手级功能
  - 价格太贵 → 调整定价

### 风险2：技术成本过高
**信号**：用户增长但成本也快速增长

**应对**：
- 优化转录成本（考虑自部署 Whisper）
- 优化存储（定期清理过期项目）
- 限制免费用户资源使用

### 风险3：竞争对手
**信号**：出现类似产品

**应对**：
- 保持产品迭代速度
- 深耕细分场景（课程制作）
- 建立社区和口碑

---

## 📞 下一步行动

### 立即开始
1. **本周**：完成Week 1任务（字幕系统）
2. **本月**：完成4周冲刺
3. **下月初**：内测上线

### 需要的资源
- **开发**：1-2人全职/兼职
- **预算**：
  - 服务器：¥500/月
  - 域名：¥50/年
  - 其他：¥200/月（监控、CDN等）
  - 总计：~¥700-800/月

### 联系和支持
- GitHub: 创建 Issue 追踪进度
- 用户反馈：创建简单的反馈表单
- 社区：考虑建立微信群/Discord

---

## 📝 附录：详细任务拆解

### A. 字幕样式编辑器详细设计

```typescript
// frontend/src/components/editor/SubtitleStylePanel.tsx
interface SubtitleStylePanelProps {
  currentStyle: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
}

export interface SubtitleStyle {
  // 文字样式
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontColor: string;
  
  // 背景
  backgroundColor: string;
  backgroundOpacity: number;
  
  // 位置
  position: 'top' | 'center' | 'bottom';
  offsetY: number; // 距离边缘的像素
  
  // 效果
  stroke: {
    enabled: boolean;
    color: string;
    width: number;
  };
  shadow: {
    enabled: boolean;
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  
  // 动画
  animation: {
    fadeIn: boolean;
    fadeOut: boolean;
    duration: number; // 毫秒
  };
}
```

### B. 模板数据示例

```typescript
// backend/src/data/templates.ts
export const TEMPLATES: VideoTemplate[] = [
  {
    id: 'tech-tutorial',
    name: '技术教程',
    category: 'course',
    thumbnail: '/templates/tech.jpg',
    description: '适合编程、软件教学，代码风格字幕',
    subtitleStyle: {
      fontFamily: 'Monaco, Consolas, monospace',
      fontSize: 32,
      fontWeight: 'normal',
      fontColor: '#00FF00',
      backgroundColor: '#000000',
      backgroundOpacity: 0.8,
      position: 'bottom',
      offsetY: 80,
      stroke: { enabled: true, color: '#000000', width: 2 },
      shadow: { enabled: false },
      animation: { fadeIn: true, fadeOut: true, duration: 200 }
    },
    exportSettings: {
      format: 'mp4',
      resolution: '1080p',
      quality: 'high'
    }
  },
  {
    id: 'douyin-vertical',
    name: '抖音竖屏',
    category: 'short-video',
    thumbnail: '/templates/douyin.jpg',
    description: '9:16竖屏，醒目字幕，快节奏',
    subtitleStyle: {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: 48,
      fontWeight: 'bold',
      fontColor: '#FFFFFF',
      backgroundColor: '#FF6B6B',
      backgroundOpacity: 0.9,
      position: 'center',
      offsetY: 0,
      stroke: { enabled: true, color: '#000000', width: 4 },
      shadow: { enabled: true, color: '#000000', blur: 10, offsetX: 2, offsetY: 2 },
      animation: { fadeIn: true, fadeOut: true, duration: 150 }
    },
    exportSettings: {
      format: 'mp4',
      resolution: '1080p',
      quality: 'high',
      aspectRatio: '9:16'
    }
  }
  // ... 其他8个模板
];
```

### C. 配额中间件实现

```typescript
// backend/src/middleware/checkLimits.ts
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';

export async function checkProjectLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = req.user as User;
  
  // 付费用户跳过检查
  if (user.plan === 'pro') {
    return next();
  }
  
  // 检查免费用户配额
  const projectCount = await getProjectCountThisMonth(user.id);
  
  if (projectCount >= user.limits.projectsPerMonth) {
    return res.status(403).json({
      error: 'PROJECT_LIMIT_REACHED',
      message: `免费用户每月限${user.limits.projectsPerMonth}个项目`,
      current: projectCount,
      limit: user.limits.projectsPerMonth,
      upgradeUrl: '/pricing',
      suggestion: '升级到Pro版本，享受无限项目'
    });
  }
  
  next();
}

export async function checkExportLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = req.user as User;
  
  if (user.plan === 'pro') {
    return next();
  }
  
  const exportCount = await getExportCountThisMonth(user.id);
  
  if (exportCount >= user.limits.exportsPerMonth) {
    return res.status(403).json({
      error: 'EXPORT_LIMIT_REACHED',
      message: `免费用户每月限${user.limits.exportsPerMonth}次导出`,
      current: exportCount,
      limit: user.limits.exportsPerMonth,
      upgradeUrl: '/pricing'
    });
  }
  
  next();
}
```

---

## 🎉 总结

这份行动计划基于我们的对话和你的实际情况，提供了：

1. ✅ **清晰的目标**：1个月MVP，Freemium模式
2. ✅ **详细的任务拆解**：4周冲刺，每天具体任务
3. ✅ **技术实现指导**：代码示例和架构建议
4. ✅ **风险管理**：预见性地识别风险和应对
5. ✅ **成功指标**：可衡量的目标

**关键成功因素**：
- 🎯 **专注**：不要被功能清单分散注意力，专注MVP
- ⚡ **速度**：快速迭代，尽快上线获取反馈
- 👂 **倾听**：用户反馈比你的想象更重要
- 💪 **坚持**：MVP只是开始，要持续优化

**下一步**：
1. Review这份计划，调整你不认同的部分
2. 创建GitHub Project看板，录入任务
3. 本周开始Week 1任务
4. 保持每周进度同步

祝你成功！🚀

---

**文档维护者**: Claude  
**最后更新**: 2026-02-10  
**版本**: 1.0

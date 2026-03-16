# 本地软件桥接设计

**日期**: 2026-03-08
**状态**: 待实现（先 CapCut，可扩展到其他软件）

## 目标

让 Underlord 能够调用用户本地安装的视频编辑软件（首选 CapCut）完成网页编辑器难以实现的高级功能，结果回传到网页。用户明确知道本地软件正在被调用。

---

## 适用场景

| 操作 | 为什么用本地软件 |
|------|----------------|
| AI 自动字幕 | CapCut 字幕质量高、支持多语言、自动排版 |
| AI 抠图 / 去背景 | 本地 AI 推理，无需上传到云端 |
| 自动重构帧（9:16竖屏化）| CapCut 的智能裁剪算法 |
| 速度曲线 / 变速效果 | CapCut 内置丰富曲线模板 |

---

## 架构

```
Underlord (AI)
  ↓ function calling
CapCut Tool (ToolRegistry)
  ↓ spawn
capcut_bridge.py (Python)
  ├─ 生成 .capcut 项目文件
  ├─ 打开 CapCut 加载项目
  ├─ pywinauto 触发操作
  ├─ 监听导出目录
  └─ 返回结果路径
  ↓
后端读取结果文件
  ↓ SSE
前端显示结果
```

---

## SSE 协议新增事件

```typescript
| { type: 'local_app_start'; app: string; operation: string }
| { type: 'local_app_progress'; message: string }
| { type: 'local_app_done'; outputUrl: string; outputType: 'video' | 'srt' | 'image' }
```

前端收到 `local_app_start` 时显示：
```
[CapCut 图标] 正在调用本地 CapCut — AI 字幕生成中...  [●●●○○]
CapCut 窗口正在后台运行，完成后自动关闭
```

---

## 第一部分：能力探测

```typescript
// backend/src/services/capabilityProbe.ts

const CAPCUT_PATHS = {
  win32: [
    'C:/Program Files/CapCut/CapCut.exe',
    process.env.LOCALAPPDATA + '/CapCut/Apps/CapCut.exe',
  ],
  darwin: [
    '/Applications/CapCut.app',
    process.env.HOME + '/Applications/CapCut.app',
  ],
};

export async function probeCapCut(): Promise<{ available: boolean; path?: string }> {
  const paths = CAPCUT_PATHS[process.platform as 'win32' | 'darwin'] ?? [];
  for (const p of paths) {
    if (fs.existsSync(p)) return { available: true, path: p };
  }
  return { available: false };
}
```

启动时探测，结果注入 ToolRegistry（不可用则不注册 CapCut 工具）。

---

## 第二部分：CapCut 项目文件生成

CapCut 项目文件 (`.capcut`) = ZIP 压缩包，内含 `draft_content.json`。

```typescript
// backend/src/services/capcut/projectGenerator.ts

export function generateCapCutProject(params: {
  videoPath: string;
  duration: number;
  cutRegions?: { start: number; end: number }[];
}): Buffer {
  const draft = {
    id: crypto.randomUUID(),
    materials: {
      videos: [{ path: params.videoPath, duration: params.duration * 1000000 }],
    },
    tracks: [
      {
        type: 'video',
        segments: buildSegments(params.videoPath, params.duration, params.cutRegions),
      },
    ],
  };

  // 打包成 ZIP
  const zip = new AdmZip();
  zip.addFile('draft_content.json', Buffer.from(JSON.stringify(draft, null, 2)));
  return zip.toBuffer();
}
```

> 注：CapCut 项目格式通过社区逆向工程得到，需持续维护。

---

## 第三部分：Python UI 自动化桥接

```python
# backend/src/services/capcut/capcut_bridge.py

import sys, json, os, time, subprocess, shutil
import pywinauto  # Windows; macOS 用 pyobjc

def run(operation: str, project_path: str, output_dir: str):
    # 1. 打开 CapCut 加载项目
    capcut_exe = find_capcut()
    proc = subprocess.Popen([capcut_exe, project_path])

    # 2. 等待 CapCut 窗口出现
    app = pywinauto.Application().connect(title_re='.*CapCut.*', timeout=15)
    win = app.top_window()
    time.sleep(2)  # 等待 UI 完全加载

    # 3. 触发指定操作（键盘快捷键）
    if operation == 'auto_caption':
        win.type_keys('^+a')  # Ctrl+Shift+A（示例，需验证实际快捷键）
        time.sleep(10)         # 等待 AI 字幕生成
        win.type_keys('^e')    # 导出

    elif operation == 'remove_background':
        # 选中视频轨道 → 触发去背景
        win.type_keys('%{F10}')
        time.sleep(8)
        win.type_keys('^e')

    # 4. 监听导出目录，等待输出文件
    result = wait_for_output(output_dir, timeout=120)
    print(json.dumps({'success': True, 'output': result}))

def wait_for_output(directory: str, timeout: int) -> str:
    deadline = time.time() + timeout
    before = set(os.listdir(directory))
    while time.time() < deadline:
        after = set(os.listdir(directory))
        new_files = after - before
        if new_files:
            return os.path.join(directory, new_files.pop())
        time.sleep(1)
    raise TimeoutError('CapCut did not produce output in time')

if __name__ == '__main__':
    params = json.loads(sys.argv[1])
    run(params['operation'], params['projectPath'], params['outputDir'])
```

---

## 第四部分：ToolRegistry 工具定义

```typescript
// backend/src/services/tools/capcut_auto_caption.tool.ts

import { toolRegistry } from '../toolRegistry';
import { spawn } from 'child_process';
import path from 'path';

toolRegistry.register({
  name: 'capcut_auto_caption',
  label: 'CapCut AI 字幕',
  description: 'Generate AI captions using local CapCut installation. User must have CapCut installed.',
  openAISchema: {
    name: 'capcut_auto_caption',
    description: 'Generate high-quality AI captions using local CapCut. Use this when the user asks for auto-captions or subtitles.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  execute: async (params, context, emit) => {
    emit({ type: 'local_app_start', app: 'CapCut', operation: 'AI 字幕生成' });

    const outputDir = path.join(os.tmpdir(), 'description-capcut-out');
    fs.mkdirSync(outputDir, { recursive: true });

    const projectBuf = generateCapCutProject({ videoPath: context.mediaFilePath!, duration: context.duration });
    const projectPath = path.join(os.tmpdir(), `project-${Date.now()}.capcut`);
    fs.writeFileSync(projectPath, projectBuf);

    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, '../capcut/capcut_bridge.py');
      const args = [JSON.stringify({ operation: 'auto_caption', projectPath, outputDir })];
      const child = spawn('python3', [script, ...args]);

      let stdout = '';
      child.stdout.on('data', d => stdout += d);
      child.stderr.on('data', d => emit({ type: 'local_app_progress', message: d.toString().trim() }));

      child.on('close', code => {
        if (code !== 0) return reject(new Error('CapCut bridge failed'));
        const result = JSON.parse(stdout);
        emit({ type: 'local_app_done', outputUrl: `/api/temp/${path.basename(result.output)}`, outputType: 'srt' });
        resolve(null);
      });
    });
  },
});
```

---

## 第五部分：前端状态展示

`InteractiveWorkflowSidebar` 处理新 SSE 事件：

```tsx
case 'local_app_start':
  // 在 assistant 消息下方插入状态条
  return { ...msg, localApp: { app: event.app, operation: event.operation, status: 'running' } };

case 'local_app_done':
  // 显示结果（视频/字幕预览）
  return { ...msg, localApp: { ...msg.localApp, status: 'done', outputUrl: event.outputUrl } };
```

UI 展示：
```
[CapCut] AI 字幕生成中...  ████████░░  80%
CapCut 窗口正在后台运行
```

---

## 文件改动清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `backend/src/services/capabilityProbe.ts` | 新建 | 探测 CapCut 安装路径 |
| `backend/src/services/capcut/projectGenerator.ts` | 新建 | 生成 .capcut 项目文件 |
| `backend/src/services/capcut/capcut_bridge.py` | 新建 | Python UI 自动化脚本 |
| `backend/src/services/tools/capcut_auto_caption.tool.ts` | 新建 | ToolRegistry 注册 |
| `backend/src/routes/ai.ts` | 修改 | 处理 local_app_* SSE 事件 |
| `frontend/src/components/editor/InteractiveWorkflowSidebar.tsx` | 修改 | 渲染本地应用状态条 |

---

## 风险和限制

| 风险 | 缓解措施 |
|------|---------|
| CapCut 版本更新导致快捷键变化 | 版本检测 + 降级到菜单点击 |
| 导出时间不确定 | 超时机制（120s）+ 进度提示 |
| 项目格式逆向不完整 | 只用核心字段（video path + duration）|
| macOS 权限（辅助功能访问）| 引导用户开启系统偏好设置权限 |
| CapCut 未安装 | 能力探测返回不可用，工具不注册，Underlord 不会尝试调用 |

---

## 不在本次范围

- DaVinci Resolve / After Effects / Premiere 适配器（相同模式，单独文件）
- 结果自动导入回时间轴（需解析导出文件格式）
- 无头模式（隐藏 CapCut 窗口）

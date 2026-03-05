#!/bin/bash
# Remotion Skill 环境检查 + 一键启动脚本
# 用途: bash check-env.sh

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🔍 正在检查 Remotion Skill..."
echo ""

# 1. Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "    请访问: https://nodejs.org"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# 2. package.json
if [ ! -f "$SKILL_DIR/package.json" ]; then
    echo "❌ package.json 文件丢失"
    exit 1
fi
echo "✅ package.json"

# 3. node_modules（检查依赖是否安装）
if [ ! -d "$SKILL_DIR/node_modules" ]; then
    echo "⚠️  node_modules 不存在，正在安装..."
    cd "$SKILL_DIR" && npm install --silent
    if [ $? -eq 0 ]; then
        echo "✅ 安装完成"
    else
        echo "❌ 安装失败"
        exit 1
    fi
else
    echo "✅ node_modules"
fi

# 4. src/index.tsx
if [ ! -f "$SKILL_DIR/src/index.tsx" ]; then
    echo "⚠️  src/index.tsx 文件丢失"
else
    echo "✅ src/index.tsx"
fi

# 5. 合成数量
TEMPLATE_COUNT=$(ls -d "$SKILL_DIR/合成数据"/*/ 2>/dev/null | wc -l | tr -d ' ')
echo "✅ 合成数据: ${TEMPLATE_COUNT} 个合成"

echo ""
echo "🎉 环境检查完毕，所有依赖已就绪"
echo ""
echo "📋 使用说明:"
echo "  cd $SKILL_DIR"
echo "  npx remotion render src/index.tsx <composition-id> /输出路径/xxx.gif --codec=gif --every-nth-frame=2"
echo ""
echo "💡 composition-id:"
grep -o 'id="[^"]*"' "$SKILL_DIR/src/index.tsx" 2>/dev/null | sed 's/id="//;s/"$//' | while read id; do
    echo "  - $id"
done

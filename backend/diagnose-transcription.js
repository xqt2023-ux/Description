/**
 * 转录诊断工具
 * 用于排查转录失败的问题
 */

const path = require('path');
const fs = require('fs');

// 确保从 backend 目录加载 .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('=================================');
console.log('转录诊断工具');
console.log('=================================\n');

// 1. 检查环境变量
console.log('1. 检查环境变量配置:');
console.log('-----------------------------------');
console.log('✓ PORT:', process.env.PORT || '未设置');
console.log('✓ NODE_ENV:', process.env.NODE_ENV || '未设置');
console.log('✓ GROQ_API_KEY:', process.env.GROQ_API_KEY ? `已设置 (${process.env.GROQ_API_KEY.substring(0, 20)}...)` : '❌ 未设置');
console.log('✓ OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `已设置 (${process.env.OPENAI_API_KEY.substring(0, 20)}...)` : '❌ 未设置');
console.log('✓ OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL || '未设置 (使用默认)');
console.log('✓ HTTP_PROXY:', process.env.HTTP_PROXY || '未设置');
console.log('✓ HTTPS_PROXY:', process.env.HTTPS_PROXY || '未设置');
console.log('✓ NO_PROXY:', process.env.NO_PROXY || '未设置');
console.log('');

// 2. 检查 FFmpeg
console.log('2. 检查 FFmpeg:');
console.log('-----------------------------------');
const { execSync } = require('child_process');
try {
  const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8' });
  const firstLine = ffmpegVersion.split('\n')[0];
  console.log('✓ FFmpeg 已安装:', firstLine);
} catch (error) {
  console.log('❌ FFmpeg 未安装或不在 PATH 中');
  console.log('   请从以下地址下载安装: https://ffmpeg.org/download.html');
}
console.log('');

// 3. 检查上传目录
console.log('3. 检查上传目录:');
console.log('-----------------------------------');
const uploadsDir = path.join(__dirname, 'uploads');
const videosDir = path.join(uploadsDir, 'videos');
const audioDir = path.join(uploadsDir, 'audio');

console.log('✓ uploads 目录:', fs.existsSync(uploadsDir) ? '存在' : '❌ 不存在');
console.log('✓ videos 目录:', fs.existsSync(videosDir) ? '存在' : '❌ 不存在');
console.log('✓ audio 目录:', fs.existsSync(audioDir) ? '存在' : '创建中...');

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
  console.log('  ✓ audio 目录已创建');
}

// 列出视频文件
if (fs.existsSync(videosDir)) {
  const videoFiles = fs.readdirSync(videosDir);
  console.log(`✓ 找到 ${videoFiles.length} 个视频文件`);
  if (videoFiles.length > 0) {
    console.log('  最近的文件:', videoFiles[videoFiles.length - 1]);
  }
}
console.log('');

// 4. 测试 API 连接
console.log('4. 测试 API 连接:');
console.log('-----------------------------------');

async function testAPIs() {
  // 测试 Groq API
  if (process.env.GROQ_API_KEY) {
    console.log('正在测试 Groq API...');
    try {
      const Groq = require('groq-sdk');
      const { HttpsProxyAgent } = require('https-proxy-agent');
      
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
      
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
        httpAgent: httpAgent,
      });

      // 简单测试：列出模型
      const models = await groq.models.list();
      console.log('✓ Groq API 连接成功');
      console.log(`  可用模型: ${models.data.length} 个`);
    } catch (error) {
      console.log('❌ Groq API 连接失败:', error.message);
      console.log('  错误详情:', error);
    }
  } else {
    console.log('⚠ Groq API Key 未配置,跳过测试');
  }

  console.log('');

  // 测试 OpenAI API
  if (process.env.OPENAI_API_KEY) {
    console.log('正在测试 OpenAI API...');
    try {
      const OpenAI = require('openai');
      const { HttpsProxyAgent } = require('https-proxy-agent');
      
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
      
      const config = {
        apiKey: process.env.OPENAI_API_KEY,
        httpAgent: httpAgent,
      };
      
      if (process.env.OPENAI_BASE_URL) {
        config.baseURL = process.env.OPENAI_BASE_URL;
      }
      
      const openai = new OpenAI(config);

      // 简单测试：列出模型
      const models = await openai.models.list();
      console.log('✓ OpenAI API 连接成功');
      console.log(`  可用模型: ${models.data.length} 个`);
    } catch (error) {
      console.log('❌ OpenAI API 连接失败:', error.message);
      if (error.status) {
        console.log(`  HTTP 状态码: ${error.status}`);
      }
    }
  } else {
    console.log('⚠ OpenAI API Key 未配置,跳过测试');
  }
  
  console.log('');
}

// 5. 提供解决方案
function printSolutions() {
  console.log('=================================');
  console.log('常见问题解决方案:');
  console.log('=================================\n');
  
  console.log('问题 1: API Key 无效或未配置');
  console.log('解决方案:');
  console.log('  1. 检查 backend/.env 文件中的 GROQ_API_KEY 或 OPENAI_API_KEY');
  console.log('  2. Groq API Key 获取: https://console.groq.com');
  console.log('  3. OpenAI API Key 获取: https://platform.openai.com/api-keys');
  console.log('');
  
  console.log('问题 2: 代理配置导致连接失败');
  console.log('解决方案:');
  console.log('  1. 如果使用 Clash TUN 模式,注释掉 .env 中的 HTTP_PROXY 和 HTTPS_PROXY');
  console.log('  2. 如果使用系统代理模式,确保代理端口正确 (通常是 7897 或 7890)');
  console.log('  3. 检查代理软件是否正在运行');
  console.log('');
  
  console.log('问题 3: FFmpeg 未安装或路径问题');
  console.log('解决方案:');
  console.log('  1. Windows: 从 https://www.gyan.dev/ffmpeg/builds/ 下载');
  console.log('  2. 解压后将 bin 目录添加到系统 PATH');
  console.log('  3. 重启终端后执行: ffmpeg -version');
  console.log('');
  
  console.log('问题 4: 文件路径或权限问题');
  console.log('解决方案:');
  console.log('  1. 确保 backend/uploads 目录存在且有写权限');
  console.log('  2. 检查视频文件是否存在于 backend/uploads/videos/');
  console.log('  3. 确保文件未被其他程序占用');
  console.log('');
  
  console.log('问题 5: 转录 API 限制');
  console.log('解决方案:');
  console.log('  1. Groq: 免费层有请求限制,每分钟 30 次请求');
  console.log('  2. OpenAI: 需要付费账户才能使用 Whisper API');
  console.log('  3. 如果遇到限制,等待一段时间后重试');
  console.log('');
}

// 运行诊断
testAPIs()
  .then(() => {
    printSolutions();
    console.log('=================================');
    console.log('诊断完成!');
    console.log('=================================');
  })
  .catch(error => {
    console.error('诊断过程出错:', error);
    printSolutions();
  });

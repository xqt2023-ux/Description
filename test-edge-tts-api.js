/**
 * Edge TTS API 测试脚本
 * 通过后端 API 测试 Edge TTS 功能
 */

const http = require('http');

async function testEdgeTTSAPI() {
  console.log('='.repeat(60));
  console.log('Edge TTS API 功能测试');
  console.log('='.repeat(60));

  const testData = {
    userRequest: 'Translate this video to Chinese with dubbed audio. Extract the transcript, translate it, and generate a new audio track.',
    mediaId: 'test-media',
    mediaInfo: {
      duration: 10,
      hasAudio: true,
    },
    autoExecute: false  // 只生成计划，不执行
  };

  console.log('\n测试配置:');
  console.log(`  API: http://localhost:3001/api/ai/orchestrate`);
  console.log(`  请求: 配音工作流`);
  console.log('');
  console.log('⏳ 正在发送请求...\n');

  const postData = JSON.stringify(testData);

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/ai/orchestrate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;

        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200 && response.success) {
            console.log('='.repeat(60));
            console.log('✅ API 测试成功！');
            console.log('='.repeat(60));
            console.log(`  状态码: ${res.statusCode}`);
            console.log(`  耗时: ${duration}ms`);
            console.log('');
            console.log('📋 响应数据:');
            console.log(JSON.stringify(response, null, 2));
            console.log('');
            console.log('💡 提示: API 可以正常接受请求');
            console.log('');
            resolve(true);
          } else {
            console.log('='.repeat(60));
            console.log('⚠️  API 返回错误');
            console.log('='.repeat(60));
            console.log(`  状态码: ${res.statusCode}`);
            console.log('  错误信息:', response.error || 'Unknown error');
            console.log('');
            console.log('完整响应:');
            console.log(JSON.stringify(response, null, 2));
            resolve(false);
          }
        } catch (error) {
          console.error('❌ JSON 解析失败:', error.message);
          console.error('原始响应:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('='.repeat(60));
      console.log('❌ 请求失败');
      console.log('='.repeat(60));
      console.error('错误信息:', error.message);
      console.log('');

      if (error.code === 'ECONNREFUSED') {
        console.log('🔍 诊断: 无法连接到后端服务器');
        console.log('');
        console.log('请确保:');
        console.log('  1. 后端服务器正在运行 (npm run dev)');
        console.log('  2. 端口 3001 未被占用');
        console.log('  3. 防火墙未阻止连接');
      }

      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 更简单的测试：直接测试 Edge TTS 库
async function testEdgeTTSDirectly() {
  console.log('='.repeat(60));
  console.log('Edge TTS 直接测试');
  console.log('='.repeat(60));

  try {
    // 使用动态 import 加载 edge-tts (因为它可能是 ESM 模块)
    const edgeTts = await import('edge-tts');
    const { ttsSave } = edgeTts;

    const testText = '你好，这是一个 Edge TTS 测试。';
    const outputPath = `./test-output-${Date.now()}.mp3`;

    console.log('\n测试配置:');
    console.log(`  文本: "${testText}"`);
    console.log(`  输出: ${outputPath}`);
    console.log('');
    console.log('⏳ 正在生成语音...\n');

    const startTime = Date.now();

    await ttsSave(testText, outputPath, {
      voice: 'zh-CN-XiaoxiaoNeural',
    });

    const duration = Date.now() - startTime;
    const fs = require('fs');

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log('='.repeat(60));
      console.log('✅ 直接测试成功！');
      console.log('='.repeat(60));
      console.log(`  生成文件: ${outputPath}`);
      console.log(`  文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`  耗时: ${duration}ms`);
      console.log('');
      console.log('💡 Edge TTS 库本身工作正常！');
      console.log('');
      return true;
    } else {
      console.error('❌ 文件未生成');
      return false;
    }
  } catch (error) {
    console.log('='.repeat(60));
    console.log('❌ 直接测试失败');
    console.log('='.repeat(60));
    console.error('错误信息:', error.message);
    console.log('');

    if (error.message && error.message.includes('403')) {
      console.log('🔍 诊断: 403 Forbidden 错误');
      console.log('');
      console.log('这是 Clash TUN 模式代理拦截导致的。');
      console.log('');
      console.log('✅ 解决方案:');
      console.log('  1. 打开 Clash 配置文件');
      console.log('  2. 在 rules 部分添加:');
      console.log('     - DOMAIN-SUFFIX,microsoft.com,DIRECT');
      console.log('     - DOMAIN-SUFFIX,bing.com,DIRECT');
      console.log('  3. 重启 Clash 服务');
      console.log('  4. 重新运行此测试');
      console.log('');
      console.log('📖 详细指南: 查看 CLASH_配置指南.md');
      console.log('');
    }

    return false;
  }
}

// 运行测试
console.log('开始测试 Edge TTS 功能...\n');

testEdgeTTSDirectly()
  .then(success => {
    console.log('\n' + '='.repeat(60));
    if (success) {
      console.log('✅ 所有测试通过！');
      process.exit(0);
    } else {
      console.log('❌ 测试失败，请检查上述错误信息');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n未预期的错误:', error);
    process.exit(1);
  });

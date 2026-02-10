/**
 * Edge TTS 功能测试脚本
 * 测试是否能成功生成语音文件
 */

const path = require('path');
const fs = require('fs');

// 动态导入 ES 模块
async function testEdgeTTS() {
  console.log('='.repeat(60));
  console.log('Edge TTS 功能测试');
  console.log('='.repeat(60));

  try {
    // 导入 edgeTts 模块
    const { edgeTextToSpeech } = await import('./dist/services/edgeTts.js');

    // 测试参数
    const testText = '你好，这是一个 Edge TTS 测试。';
    const outputDir = path.join(__dirname, 'uploads', 'audio');
    const outputPath = path.join(outputDir, `test-${Date.now()}.mp3`);

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`✅ 创建输出目录: ${outputDir}`);
    }

    console.log('\n测试配置:');
    console.log(`  文本: "${testText}"`);
    console.log(`  语音: zh-CN-XiaoxiaoNeural (默认)`);
    console.log(`  输出: ${outputPath}`);
    console.log('');

    console.log('⏳ 正在生成语音...\n');

    const startTime = Date.now();

    // 调用 Edge TTS
    const audioPath = await edgeTextToSpeech(
      testText,
      outputPath,
      'zh-CN-XiaoxiaoNeural'
    );

    const duration = Date.now() - startTime;

    // 检查文件是否生成
    if (fs.existsSync(audioPath)) {
      const stats = fs.statSync(audioPath);
      console.log('='.repeat(60));
      console.log('✅ 测试成功！');
      console.log('='.repeat(60));
      console.log(`  生成文件: ${audioPath}`);
      console.log(`  文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`  耗时: ${duration}ms`);
      console.log('');
      console.log('💡 提示: 你可以播放该文件来验证音频质量');
      console.log('');
      return true;
    } else {
      console.error('❌ 错误: 文件未生成');
      return false;
    }

  } catch (error) {
    console.log('='.repeat(60));
    console.log('❌ 测试失败');
    console.log('='.repeat(60));
    console.error('错误信息:', error.message);
    console.error('');

    if (error.message.includes('403')) {
      console.log('🔍 诊断: 403 Forbidden 错误');
      console.log('');
      console.log('这是 Clash TUN 模式代理拦截导致的。');
      console.log('');
      console.log('解决方案:');
      console.log('  1. 查看 CLASH_配置指南.md');
      console.log('  2. 在 Clash 配置中添加直连规则:');
      console.log('     - DOMAIN-SUFFIX,microsoft.com,DIRECT');
      console.log('     - DOMAIN-SUFFIX,bing.com,DIRECT');
      console.log('  3. 重启 Clash 服务');
      console.log('');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('🔍 诊断: 连接被拒绝');
      console.log('');
      console.log('可能原因:');
      console.log('  1. 网络连接问题');
      console.log('  2. 防火墙阻止');
      console.log('  3. DNS 解析失败');
      console.log('');
    } else {
      console.log('🔍 完整错误堆栈:');
      console.error(error);
    }

    return false;
  }
}

// 运行测试
testEdgeTTS()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('未预期的错误:', error);
    process.exit(1);
  });

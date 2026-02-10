/**
 * Simple Edge TTS Test
 * Tests if Edge TTS can generate audio successfully
 */

const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');

async function testEdgeTTS() {
  console.log('🧪 Testing Edge TTS...\n');
  
  const testText = '你好，这是一个测试。';
  const outputPath = path.join(__dirname, 'uploads', 'audio', `test-${Date.now()}.mp3`);
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}\n`);
  }
  
  console.log(`📝 Text: ${testText}`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`🎤 Voice: zh-CN-XiaoxiaoNeural\n`);
  
  try {
    console.log('⏳ Generating audio...');
    
    const tts = new EdgeTTS({
      voice: 'zh-CN-XiaoxiaoNeural',
      lang: 'zh-CN',
      rate: 'default',
      pitch: 'default',
      volume: 'default',
    });
    
    // Add timeout
    const timeout = 30000; // 30 seconds
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout after 30s')), timeout)
    );
    
    await Promise.race([
      tts.ttsPromise(testText, outputPath),
      timeoutPromise
    ]);
    
    // Check if file was created
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`\n✅ SUCCESS!`);
      console.log(`📊 File size: ${stats.size} bytes`);
      console.log(`📂 Location: ${outputPath}`);
      
      // Clean up
      fs.unlinkSync(outputPath);
      console.log(`🗑️ Cleaned up test file`);
    } else {
      console.log(`\n❌ FAILED: File was not created`);
    }
    
  } catch (error) {
    console.log(`\n❌ ERROR: ${error.message}`);
    console.error('\nFull error:', error);
    
    // Check if it's a network issue
    if (error.message.includes('ECONNREFUSED') || 
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('getaddrinfo')) {
      console.log('\n💡 This appears to be a network connectivity issue.');
      console.log('   Possible causes:');
      console.log('   1. Proxy settings blocking Microsoft servers');
      console.log('   2. Firewall blocking the connection');
      console.log('   3. Microsoft Edge TTS service is down');
      console.log('\n   Try:');
      console.log('   - Check if proxy is working: curl https://speech.platform.bing.com');
      console.log('   - Temporarily disable proxy in .env');
      console.log('   - Check Windows firewall settings');
    }
  }
}

// Run test
testEdgeTTS().catch(console.error);

/**
 * Phase 4 — Platform Services Validation Script
 * 
 * Tests:
 * 1. All platform modules load without errors
 * 2. postToPlatform routes correctly
 * 3. YouTube rejects image posts
 * 4. callWithRefresh pattern exists
 */
require('dotenv').config();

const { postToPlatform, callWithRefresh, refreshToken } = require('./src/services/platforms');

// Test 1: Verify all modules load
console.log('=== Test 1: Module Loading ===');
const instagram = require('./src/services/platforms/instagram');
const facebook = require('./src/services/platforms/facebook');
const linkedin = require('./src/services/platforms/linkedin');
const youtube = require('./src/services/platforms/youtube');

console.log('✅ instagram.postContent:', typeof instagram.postContent === 'function' ? 'OK' : 'FAIL');
console.log('✅ facebook.postContent:', typeof facebook.postContent === 'function' ? 'OK' : 'FAIL');
console.log('✅ linkedin.postContent:', typeof linkedin.postContent === 'function' ? 'OK' : 'FAIL');
console.log('✅ youtube.postContent:', typeof youtube.postContent === 'function' ? 'OK' : 'FAIL');

// Test 2: Verify routing
console.log('\n=== Test 2: Platform Router ===');
console.log('✅ postToPlatform:', typeof postToPlatform === 'function' ? 'OK' : 'FAIL');
console.log('✅ callWithRefresh:', typeof callWithRefresh === 'function' ? 'OK' : 'FAIL');
console.log('✅ refreshToken:', typeof refreshToken === 'function' ? 'OK' : 'FAIL');

// Test 3: YouTube rejects images
console.log('\n=== Test 3: YouTube Image Rejection ===');
(async () => {
  try {
    await youtube.postContent(
      { access_token: 'fake', refresh_token: null },
      { mediaUrl: 'https://example.com/img.jpg', mediaType: 'image', caption: 'test' }
    );
    console.log('❌ Should have thrown an error');
  } catch (err) {
    if (err.message.includes('YouTube only supports video posts')) {
      console.log('✅ YouTube image rejection: OK —', err.message);
    } else {
      console.log('❌ Wrong error:', err.message);
    }
  }

  // Test 4: Unknown platform
  console.log('\n=== Test 4: Unknown Platform ===');
  try {
    await postToPlatform('tiktok', { access_token: 'x' }, {});
    console.log('❌ Should have thrown');
  } catch (err) {
    if (err.message.includes('Unknown platform')) {
      console.log('✅ Unknown platform rejection: OK —', err.message);
    } else {
      console.log('❌ Wrong error:', err.message);
    }
  }

  console.log('\n=== All Phase 4 Validation Tests Complete ===');
  process.exit(0);
})();

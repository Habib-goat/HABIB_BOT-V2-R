const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'native-assets');
const destDir = path.join(__dirname, '..', 'node_modules', 'fca-riyad', 'src', 'api', 'socket', 'e2ee', 'native', 'build');

try {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of ['messagix.so', 'messagix.dll']) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log('Copied', file, 'to', dest);
    } else {
      console.warn('Missing native asset:', src);
    }
  }
} catch (err) {
  console.error('copy-native-e2ee failed:', err.message);
  process.exit(1);
}

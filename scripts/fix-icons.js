const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../assets/orange80.png');
const buildDir = path.join(__dirname, '../build/chrome-mv3-dev');

if (!fs.existsSync(buildDir)) {
  console.log('Build directory not found. Run npm run dev first.');
  process.exit(1);
}

const icons = fs.readdirSync(buildDir).filter(f => f.startsWith('icon') && f.endsWith('.png'));

Promise.all(icons.map(icon => {
  const size = parseInt(icon.match(/icon(\d+)/)[1]);
  return sharp(src).resize(size, size).toFile(path.join(buildDir, icon));
})).then(() => {
  console.log('Replaced icons with orange colored versions:', icons.length, 'icons');
}).catch(err => {
  console.error('Error replacing icons:', err);
  process.exit(1);
});

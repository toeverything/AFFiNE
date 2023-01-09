const fs = require('fs');
const path = require('path');

const templatePath = path.resolve(__dirname, 'module-resolve.tmpl.js');
const destinationPath = path.resolve(__dirname, '../../module-resolve.cjs');

console.log('template path', templatePath);
console.log('destination path', destinationPath);

fs.copyFileSync(templatePath, destinationPath);

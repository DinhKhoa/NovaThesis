const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(directoryPath, function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/bg-\[\#050505\]/g, 'bg-[var(--bg-primary)]');
    content = content.replace(/bg-\[\#09090b\]/g, 'bg-[var(--bg-secondary)]');
    content = content.replace(/text-emerald-400/g, 'text-[var(--accent)]');
    content = content.replace(/bg-emerald-400/g, 'bg-[var(--accent)]');
    content = content.replace(/bg-emerald-500\/10/g, 'bg-[var(--accent)]/10');
    content = content.replace(/border-emerald-500\/20/g, 'border-[var(--accent)]/20');
    content = content.replace(/shadow-emerald-500\/20/g, 'shadow-[var(--accent)]/20');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});

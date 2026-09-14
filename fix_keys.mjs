import fs from 'node:fs';
import path from 'node:path';

const dir = 'content_parts';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const p = path.join(dir, f);
  let src = fs.readFileSync(p, 'utf8');
  // ключ вида "id " :  ->  "id":
  const fixed = src.replace(/"([^"]+?)\s+"\s*:/g, (m, key) => `"${key.trim()}":`);
  if (fixed !== src) {
    fs.writeFileSync(p, fixed);
    console.log('Исправлен:', f);
  }
}
console.log('Готово');
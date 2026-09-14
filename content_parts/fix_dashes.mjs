import fs from 'fs';
import path from 'path';

const dir = './';
const files = fs.readdirSync(dir).filter(f => f.startsWith('author_') && f.endsWith('.js'));

let totalChanges = 0;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  
  // Заменяем длинные тире (—) на короткие (-)
  content = content.replace(/—/g, '-');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    const changes = (original.match(/—/g) || []).length;
    totalChanges += changes;
    console.log(`✅ ${file}: заменено ${changes} тире`);
  } else {
    console.log(`⏭️  ${file}: изменений нет`);
  }
});

console.log(`\n📊 Итого обработано файлов: ${files.length}`);
console.log(`📊 Всего заменено тире: ${totalChanges}`);

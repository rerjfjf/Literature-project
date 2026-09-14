import fs from 'fs';

const filePath = './content_parts/author_tvardovsky.js';
let content = fs.readFileSync(filePath, 'utf-8');

// Убираем пробелы внутри русских слов (между буквами)
content = content.replace(/([а-яА-ЯёЁ])\s+([а-яА-ЯёЁ])/g, '$1$2');

// Убираем пробелы перед закрывающими кавычками в значениях
content = content.replace(/([^"])\s+"/g, '$1"');

// Убираем лишние пробелы в начале и конце строк
content = content.replace(/^\s+/gm, '');
content = content.replace(/\s+$/gm, '');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Пробелы внутри слов исправлены!');
import fs from 'fs';

const filePath = './content_parts/author_tvardovsky.js';
let content = fs.readFileSync(filePath, 'utf-8');

// Убираем пробелы перед закрывающими кавычками в ключах
content = content.replace(/"(\s+)"/g, '"');

// Убираем пробелы в начале и конце значений строк (но не внутри текста)
content = content.replace(/:\s*"(\s+)([^"]+?)(\s+)"(\s*[,\n\r\]}])/g, ':"$2"$4');

// Убираем лишние пробелы после двоеточия
content = content.replace(/:\s+/g, ':');

// Убираем пробелы перед запятыми
content = content.replace(/\s+,/g, ',');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Синтаксис исправлен!');
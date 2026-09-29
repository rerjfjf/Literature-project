import fs from 'fs';
import path from 'path';

const dir = './content_parts';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

const questionsMap = {};

files.forEach(file => {
  const content = fs.readFileSync(path.join(dir, file), 'utf-8');
  
  // Ищем все section.id и section.title с помощью регулярных выражений
  // Паттерн ищет: "id": "какой-то-id" ... "title": "Какой-то заголовок"
  const sectionRegex = /"id"\s*:\s*"([^"]+)"[\s\S]*?"title"\s*:\s*"([^"]+)"/g;
  let match;
  
  while ((match = sectionRegex.exec(content)) !== null) {
    const id = match[1];
    const title = match[2];
    
    // Пропускаем служебные или пустые заголовки
    if (!title || title.length < 5 || id.includes('trainer')) continue;
    
    // Генерируем уникальный черновик вопроса на основе заголовка
    questionsMap[id] = `Как в разделе «${title}» раскрывается тема человеческого достоинства в условиях войны и почему этот аспект важен для современного читателя?`;
  }
});

// Формируем готовый код для вставки в app.js
let output = "const SECTION_QUESTIONS = {\n";
for (const [id, question] of Object.entries(questionsMap)) {
  // Экранируем кавычки внутри вопроса, если они есть
  const safeQuestion = question.replace(/"/g, '\\"');
  output += `  "${id}": "${safeQuestion}",\n`;
}
output += "};\n";

fs.writeFileSync('SECTION_QUESTIONS_GENERATED.js', output, 'utf-8');
console.log(`✅ Готово! Найдено ${Object.keys(questionsMap).length} разделов.`);
console.log(`📄 Результат сохранен в файл: SECTION_QUESTIONS_GENERATED.js`);
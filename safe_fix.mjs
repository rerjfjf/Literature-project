import fs from 'fs';

const filePath = './content_parts/author_tvardovsky.js';
let content = fs.readFileSync(filePath, 'utf-8');

// ШАГ 1: Исправляем ТОЛЬКО ключи (слова перед двоеточием).
// Это математически безопасно: текст значений никогда не стоит перед двоеточием.
// Пример: "title ":  ->  "title":
content = content.replace(/"([^"]*?)\s+"\s*:/g, '"$1":');

// ШАГ 2: Исправляем значения ТОЛЬКО для строгих системных ключей, 
// где лишний пробел ломает код (например, type === "p" не сработает, если там "p ").
// Мы НЕ трогаем ключи "text", "title", "caption" и т.д., чтобы сохранить учебный текст.
const systemKeys = ['id', 'authorId', 'type', 'storage', 'number', 'term', 'href'];

for (const key of systemKeys) {
    // Ищем: "key": "значение " , или ] или }
    // ([^"]+?)\s+"  -> захватывает само значение и пробел перед кавычкой
    // ([,\]\}])     -> захватывает закрывающий символ (запятую или скобку)
    const regex = new RegExp(`"${key}"\\s*:\\s*"([^"]+?)\\s+"([,\\]\\}])`, 'g');
    content = content.replace(regex, `"${key}": "$1"$2`);
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Файл обработан. Текст учебника гарантированно не изменён.');
#!/usr/bin/env node
/**
 * add_initials.mjs
 *
 * Проставляет инициалы у фамилий авторов в файлах учебника (и только в них —
 * служебные/миграционные скрипты в корне проекта и в scripts/ не трогаются,
 * сам этот файл тоже себя не сканирует).
 *
 *   Рыбаков       -> А.Рыбаков
 *   Ахматова      -> А.Ахматова
 *   Васильев      -> Б.Васильев
 *   Кондратьев    -> В.Кондратьев
 *   Быков         -> В.Быков
 *   Твардовский   -> А.Твардовский   (в т.ч. опечатка "Твордовский")
 *   Окуджава      -> Б.Окуджава
 *   Заболоцкий    -> Н.Заболоцкий
 *   Высоцкий      -> В.Высоцкий
 *   Евтушенко     -> Е.Евтушенко
 *
 * Особенности:
 *  - Падежные окончания сохраняются: "рассказ Быкова" -> "рассказ В.Быкова",
 *    а не "рассказ В.Быков".
 *  - Полные ФИО ("Анатолий Наумович Рыбаков", "Анна Ахматова") сворачиваются
 *    в "И.Фамилия".
 *  - Если инициал уже стоит перед фамилией — повторно не добавляется.
 *
 * Запуск (из корня проекта Book/):
 *   node add_initials.mjs             — применить изменения
 *   node add_initials.mjs --dry-run   — только показать, что изменится
 */

import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

// Явный список файлов/директорий учебника — только это и обрабатываем.
// Больше НИЧЕГО за пределами этого списка не трогаем.
const TARGETS = [
  'content_parts',      // директория — обрабатываем все .js внутри
  'index.html',
  'login.html',
  'cover.html',
  'content_loader.js',
  'app.js',
  'data/db.json',
];

const AUTHORS = [
  { surname: 'Рыбаков',     initial: 'А', fullNames: ['Анатолий Наумович Рыбаков', 'Анатолий Рыбаков'] },
  { surname: 'Ахматова',    initial: 'А', fullNames: ['Анна Андреевна Ахматова', 'Анна Ахматова'] },
  { surname: 'Васильев',    initial: 'Б', fullNames: ['Борис Львович Васильев', 'Борис Васильев'] },
  { surname: 'Кондратьев',  initial: 'В', fullNames: ['Вячеслав Леонидович Кондратьев', 'Вячеслав Кондратьев'] },
  { surname: 'Быков',       initial: 'В', fullNames: ['Василь Владимирович Быков', 'Василь Быков'] },
  { surname: 'Твардовский', initial: 'А', fullNames: ['Александр Трифонович Твардовский', 'Александр Твардовский'] },
  { surname: 'Твордовский', initial: 'А', fixTypo: 'Твардовский', fullNames: [] },
  { surname: 'Окуджава',    initial: 'Б', fullNames: ['Булат Шалвович Окуджава', 'Булат Окуджава'] },
  { surname: 'Заболоцкий',  initial: 'Н', fullNames: ['Николай Алексеевич Заболоцкий', 'Николай Заболоцкий'] },
  { surname: 'Высоцкий',    initial: 'В', fullNames: ['Владимир Семёнович Высоцкий', 'Владимир Семенович Высоцкий', 'Владимир Высоцкий'] },
  { surname: 'Евтушенко',   initial: 'Е', fullNames: ['Евгений Александрович Евтушенко', 'Евгений Евтушенко'] },
];

// Границы слова для кириллицы/латиницы (\b в JS с кириллицей не работает)
const CYR = 'А-Яа-яЁёA-Za-z';
const notLetterBefore = `(?<![${CYR}])`;
const notInitialBefore = `(?<![${CYR}]\\.\\s?)`; // перед фамилией нет "И." или "И. "

function buildReplacements() {
  const ops = [];

  for (const a of AUTHORS) {
    const target = `${a.initial}.${a.fixTypo || a.surname}`;

    // 1) Полные ФИО -> "И.Фамилия" (без падежей, обычно встречаются в им. падеже)
    for (const full of a.fullNames) {
      const re = new RegExp(`${notLetterBefore}${full}(?![${CYR}])`, 'g');
      ops.push({ re, replace: () => target, label: full });
    }

    // 2) Опечатка "Твордовский..." -> "А.Твардовский" + сохранённое окончание
    if (a.fixTypo) {
      const re = new RegExp(
        `(?:[${CYR}]\\.\\s*)?${notLetterBefore}${a.surname}([а-яё]{0,4})(?![${CYR}])`,
        'g'
      );
      ops.push({ re, replace: (m, ending) => `${target}${ending}`, label: a.surname });
      continue;
    }

    // 3) Голая фамилия (в любом падеже) без инициала -> "И.Фамилия<падежное окончание>"
    const bareRe = new RegExp(
      `${notInitialBefore}${notLetterBefore}${a.surname}([а-яё]{0,4})(?![${CYR}])`,
      'g'
    );
    ops.push({ re: bareRe, replace: (m, ending) => `${target}${ending}`, label: a.surname });
  }

  return ops;
}

async function resolveTargetFiles() {
  const files = [];
  for (const target of TARGETS) {
    const full = path.join(ROOT, target);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      console.warn(`Пропущено (не найдено): ${target}`);
      continue;
    }
    if (stat.isDirectory()) {
      const entries = await fs.readdir(full, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.js')) {
          files.push(path.join(full, entry.name));
        }
      }
    } else {
      files.push(full);
    }
  }
  return files;
}

async function processFile(filePath, ops) {
  const original = await fs.readFile(filePath, 'utf8');
  let updated = original;
  let changesInFile = 0;

  for (const { re, replace } of ops) {
    const matches = updated.match(re);
    if (matches && matches.length) {
      changesInFile += matches.length;
      updated = updated.replace(re, replace);
    }
  }

  if (changesInFile > 0) {
    console.log(`${DRY_RUN ? '[dry-run] ' : ''}${filePath}: ${changesInFile} замен(а/ы)`);
    if (!DRY_RUN) {
      await fs.writeFile(`${filePath}.bak`, original, 'utf8');
      await fs.writeFile(filePath, updated, 'utf8');
    }
  }

  return changesInFile;
}

async function main() {
  const ops = buildReplacements();
  const files = await resolveTargetFiles();

  let totalFiles = 0;
  let totalChanges = 0;

  for (const file of files) {
    const changes = await processFile(file, ops);
    if (changes > 0) {
      totalFiles += 1;
      totalChanges += changes;
    }
  }

  console.log('---');
  console.log(`Файлов изменено: ${totalFiles}`);
  console.log(`Всего замен: ${totalChanges}`);
  if (DRY_RUN) {
    console.log('Это был dry-run, файлы не изменялись. Запустите без --dry-run, чтобы применить.');
  } else if (totalFiles > 0) {
    console.log('Резервные копии сохранены рядом с оригиналами как *.bak');
  }
}

main().catch((err) => {
  console.error('Ошибка выполнения скрипта:', err);
  process.exit(1);
});

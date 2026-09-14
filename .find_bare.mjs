import { readFileSync, readdirSync } from "node:fs";
const files = readdirSync("content_parts").filter((x) => x.endsWith(".js") && !x.endsWith(".bak"));
for (const f of files) {
  const t = readFileSync("content_parts/" + f, "utf8");
  const re = /по произведению/g;
  let m;
  while ((m = re.exec(t))) {
    const a = t.slice(m.index, m.index + 90).replace(/\n/g, " ");
    const hasTitle = a.includes("«") || a.includes('"');
    if (!hasTitle) {
      console.log(`${f}:\n  ...${t.slice(Math.max(0, m.index - 70), m.index).replace(/\n/g, " ")}|${a}...`);
    }
  }
}
console.log("Готово");

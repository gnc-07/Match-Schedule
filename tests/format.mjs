// Lays out the site's JavaScript with Prettier (a standard code formatter), so the scripts stay readable however they
// were edited: the files in js/, and the two small <script> blocks in the <head> of index.html. The CSS (styles.css)
// and the HTML markup are left exactly as written.
//   node tests/format.mjs          rewrites the files (npm run format)
//   node tests/format.mjs --check  only reports whether it would change anything (npm run format:check)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import { ROOT } from "./server.mjs";

const OPTIONS = { parser: "babel", printWidth: 120, arrowParens: "avoid" };

// index.html: only what is inside its <script> blocks
async function formatPage(html) {
  let out = "", last = 0;
  for (const m of html.matchAll(/<script>\n?([\s\S]*?)<\/script>/g)) {
    const code = (await prettier.format(m[1], OPTIONS)).trimEnd();
    out += html.slice(last, m.index) + "<script>\n" + code + "\n</script>";
    last = m.index + m[0].length;
  }
  return out + html.slice(last);
}

const files = [
  ["index.html", formatPage],
  ...readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js")).sort()
    .map(f => ["js/" + f, text => prettier.format(text, OPTIONS)]),
];
const check = process.argv.includes("--check");
const changed = [];
for (const [name, format] of files) {
  const file = path.join(ROOT, name);
  const text = readFileSync(file, "utf8");
  const out = await format(text);
  if (out === text) continue;
  changed.push(name);
  if (!check) writeFileSync(file, out);
}

if (check) {
  if (changed.length) {
    console.log(`Not laid out the standard way: ${changed.join(", ")}. Run: npm run format`);
    process.exit(1);
  }
  console.log(`Script layout is standard in all ${files.length} files.`);
} else {
  console.log(changed.length ? `Reformatted: ${changed.join(", ")}.` : "Already formatted; nothing changed.");
}

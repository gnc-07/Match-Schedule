// Lays out the JavaScript inside index.html with Prettier (a standard code formatter), so the script stays
// readable however it was edited. Only the <script> blocks are touched: the compact CSS token blocks and the
// HTML markup are left exactly as written.
//   node tests/format.mjs          rewrites index.html (npm run format)
//   node tests/format.mjs --check  only reports whether it would change anything (npm run format:check)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import { ROOT } from "./server.mjs";

const OPTIONS = { parser: "babel", printWidth: 120, arrowParens: "avoid" };
const file = path.join(ROOT, "index.html");
const html = readFileSync(file, "utf8");

let out = "", last = 0;
for (const m of html.matchAll(/<script>\n?([\s\S]*?)<\/script>/g)) {
  const code = (await prettier.format(m[1], OPTIONS)).trimEnd();
  out += html.slice(last, m.index) + "<script>\n" + code + "\n</script>";
  last = m.index + m[0].length;
}
out += html.slice(last);

if (process.argv.includes("--check")) {
  if (out !== html) {
    console.log("index.html: the script is not laid out the standard way. Run: npm run format");
    process.exit(1);
  }
  console.log("index.html: script layout is standard.");
} else if (out !== html) {
  writeFileSync(file, out);
  console.log("index.html: script reformatted.");
} else {
  console.log("index.html: already formatted; nothing changed.");
}

import fs from 'node:fs';

const p = 'C:/Users/Fong/.dsh/profiles/desktop/package.json';
let buf = fs.readFileSync(p);
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  buf = buf.slice(3);
}
const str = buf.toString('utf8');
const obj = JSON.parse(str);
fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
console.log('Stripped BOM and verified valid JSON!');

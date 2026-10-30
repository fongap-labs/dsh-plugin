import fs from 'node:fs';

for (const p of [
  'C:/Users/Fong/.dsh/profiles/desktop/cordis.patch.yml',
  'C:/Users/Fong/.dsh/profiles/desktop/package.json'
]) {
  let buf = fs.readFileSync(p);
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3);
    fs.writeFileSync(p, buf);
    console.log('Stripped BOM from:', p);
  } else {
    console.log('No BOM in:', p);
  }
}

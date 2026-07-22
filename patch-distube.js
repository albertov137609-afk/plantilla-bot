const fs = require('fs');
const path = '/app/node_modules/@distube/yt-dlp/dist/index.js';
let code = fs.readFileSync(path, 'utf8');
console.log('Encontrado no-call-home:', code.includes('no-call-home'));
code = code.replace(/["']--no-call-home["'],?\s*/g, '');
fs.writeFileSync(path, code);
console.log('Patch aplicado. Sigue:', code.includes('no-call-home'));
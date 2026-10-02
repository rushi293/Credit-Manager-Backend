import fs from 'fs';
const path = './src/routes/events.routes.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace("res.setHeader('Content-Type', 'text/event-stream');", "res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');");

fs.writeFileSync(path, content, 'utf8');
console.log("events.routes.ts encoding fixed");

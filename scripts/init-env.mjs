import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const value = template.replace('replace-with-random-secret-at-least-32-characters', randomBytes(48).toString('hex'));
try { writeFileSync(new URL('../.env', import.meta.url), value, { flag: 'wx', mode: 0o600 }); console.log('Created .env with a random secret.'); }
catch (error) { if (error.code === 'EEXIST') console.log('.env already exists; left unchanged.'); else throw error; }

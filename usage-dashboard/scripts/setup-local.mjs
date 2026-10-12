import {mkdir, writeFile, chmod, access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve, join} from 'node:path';
const dir = resolve(process.env.AFP_USAGE_STATE_DIR || join(homedir(), '.config/afp-usage'));
const root = process.argv[2];
if (!root || !/^agent:[a-z0-9_-]+:[a-zA-Z0-9:_-]+$/.test(root)) throw new Error('Usage: npm run setup -- <root-session-key>');
await mkdir(dir, {recursive:true,mode:0o700});
await chmod(dir,0o700);
const configPath=join(dir,'config.json');
try { await access(configPath); console.log('Existing private configuration preserved: '+configPath); process.exit(0); } catch(e) { if(e.code!=='ENOENT') throw e; }
const config={rootSessionKey:root,scopeLabel:'AFP project conversation and its delegated work',lookbackDays:30,snapshotPath:join(dir,'snapshot.json'),allowlistPath:join(dir,'sessions.json'),skillEventsPath:join(dir,'skills.jsonl')};
const newline=String.fromCharCode(10);
await writeFile(config.allowlistPath,JSON.stringify([root])+newline,{mode:0o600,flag:'wx'});
await writeFile(configPath,JSON.stringify(config,null,2)+newline,{mode:0o600,flag:'wx'});
console.log('Created private collection configuration in '+dir+' (dashboard access is public).');

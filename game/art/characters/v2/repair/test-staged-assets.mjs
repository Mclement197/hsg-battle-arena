// Run the existing unchanged GLB/ability tests against an isolated copy of game/public.
// Source/client behavior is byte-identical; staged GLBs replace only six copied assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const repo=path.resolve(new URL('../../../../',import.meta.url).pathname),destination=process.argv[2],models=process.argv[3];
await fs.mkdir(destination,{recursive:true});
for(const name of ['public','src','test'])await fs.cp(path.join(repo,name),path.join(destination,name),{recursive:true});
await fs.copyFile(path.join(repo,'package.json'),path.join(destination,'package.json'));
await fs.symlink(path.join(repo,'node_modules'),path.join(destination,'node_modules'),'dir').catch(e=>{if(e.code!=='EEXIST')throw e;});
for(const file of await fs.readdir(models))if(file.endsWith('.glb'))await fs.copyFile(path.join(models,file),path.join(destination,'public/assets/characters',file));
const child=spawn(process.execPath,['--test','test/characters.test.mjs','test/battle-world.test.mjs'],{cwd:destination,stdio:'inherit'});process.exitCode=await new Promise(resolve=>child.on('exit',resolve));

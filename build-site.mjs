// Publish only reviewed runtime assets, never the repository root or local reports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(root,'.site-output');
export const runtimeFiles=Object.freeze([
  'index.html','app.js','styles.css','supabase-config.js','data/worship-data.json',
  'dawn-daily.css','dawn-daily/model.mjs','dawn-daily/page.mjs','dawn-daily/xlsx.mjs',
  'analysis/catalog.mjs','analysis/dates.mjs','analysis/reader.mjs','analysis/engine.mjs',
  'next-generation.css','next-generation/model.mjs','next-generation/charts.mjs','next-generation/page.mjs'
]);
async function list(dir,prefix='') {
  let entries;
  try {entries=await fs.readdir(dir,{withFileTypes:true});} catch(e) {if(e.code==='ENOENT')return [];throw e;}
  const files=[];
  for(const entry of entries) {
    if(entry.isSymbolicLink())throw new Error('Symlinks are not allowed in deployment output');
    const relative=prefix+entry.name;
    if(entry.isDirectory())files.push(...await list(path.join(dir,entry.name),relative+'/'));
    else files.push(relative);
  }
  return files.sort();
}
const existing=await fs.lstat(output).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(existing&&(!existing.isDirectory()||existing.isSymbolicLink()))throw new Error('Invalid deployment output directory');
for(const file of await list(output))if(!runtimeFiles.includes(file))throw new Error(`Unexpected deployment output: ${file}`);
await fs.mkdir(output,{recursive:true});
for(const file of runtimeFiles) {
  const source=path.join(root,file),target=path.join(output,file);
  if(!(await fs.lstat(source)).isFile())throw new Error(`Runtime asset must be a regular file: ${file}`);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.copyFile(source,target);
}
const actual=await list(output);
if(JSON.stringify(actual)!==JSON.stringify([...runtimeFiles].sort()))throw new Error('Deployment file set does not match allowlist');
console.log(`Prepared ${actual.length} runtime files in .site-output`);

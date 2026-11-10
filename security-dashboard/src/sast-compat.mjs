import {parse} from 'acorn';
import {createHash} from 'node:crypto';

const digest=s=>createHash('sha256').update(s).digest('hex');
const syntax=source=>parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
function canonical(node) {
 if(Array.isArray(node))return node.map(canonical);
 if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).filter(([key])=>!['start','end','raw','attributes'].includes(key)).map(([key,value])=>[key,canonical(value)]));
 return node;
}
// Scanner-only view. No runtime source is changed. Acorn validates both views;
// import attributes (static metadata, not expressions) stay visible to regex rules
// in a comment. The complete executable AST must otherwise be identical.
export function compatibleSource(source) {
 const ast=syntax(source),edits=[];let attributes=0,decimals=0;
 function walk(node) {
  if(!node||typeof node!=='object')return;
  if(node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration') {
   if(node.attributes?.length) {
    const start=node.source.end,end=node.end-(source[node.end-1]===';'?1:0);
    const metadata=source.slice(start,end);
    if(!/^\s*with\s*\{/.test(metadata)||metadata.includes('*/'))throw new Error('Unsupported import metadata');
    edits.push({start,text:' /*'},{start:end,text:'*/'});attributes++;
   }
  }
  if(node.type==='ConditionalExpression') {
   const gap=source.slice(node.test.end,node.consequent.start);
   // Only an actual conditional token, never strings/comments/optional chaining.
   if(source[node.consequent.start]==='.'&&gap.endsWith('?')) {edits.push({start:node.consequent.start,text:' '});decimals++;}
  }
  for(const [key,value] of Object.entries(node))if(key!=='attributes') {
   if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }
 }
 walk(ast);
 const insertions=[];let normalized='',cursor=0,addedBytes=0;
 for(const edit of edits.sort((a,b)=>a.start-b.start)) {
  const originalOffset=Buffer.byteLength(source.slice(0,edit.start)),length=Buffer.byteLength(edit.text);
  insertions.push({originalOffset,normalizedOffset:originalOffset+addedBytes,length});addedBytes+=length;
  normalized+=source.slice(cursor,edit.start)+edit.text;cursor=edit.start;
 }normalized+=source.slice(cursor);
 const originalBytes=Buffer.from(source),normalizedLength=Buffer.byteLength(normalized);
 function mapLocation(location) {
  if(!Number.isInteger(location?.offset)||location.offset<0||location.offset>normalizedLength)throw new Error('Missing normalized byte offset');
  let offset=location.offset;
  for(const insertion of insertions){if(location.offset<insertion.normalizedOffset)break;if(location.offset<insertion.normalizedOffset+insertion.length){offset=insertion.originalOffset;break;}offset-=insertion.length;}
  const before=originalBytes.subarray(0,offset),newline=before.lastIndexOf(10);
  return {...location,offset,line:before.toString('utf8').split('\n').length,col:offset-newline};
 }

 if(JSON.stringify(canonical(ast))!==JSON.stringify(canonical(syntax(normalized))))throw new Error('Compatibility AST changed');
 if(source.split('\n').length!==normalized.split('\n').length)throw new Error('Compatibility line mapping changed');
 return {source:normalized,mapLocation,proof:{adapter:'acorn-8.15.0-static-metadata-v2',originalSha256:digest(source),normalizedSha256:digest(normalized),importAttributes:attributes,decimalTernaries:decimals,executableAstEquivalent:true,lineMapping:'identity',offsetMapping:'UTF-8 insertion map'}};
}

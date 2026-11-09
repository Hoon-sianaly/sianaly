import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
export const ident=s=>'"'+s.replaceAll('"','""')+'"';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
export const schemaQuery="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND type IN ('table','index','trigger','view') ORDER BY type,name";
export function tableRowsExpression(table){
 const cells=table.columns.map(name=>{const c=ident(name);return `json_array(typeof(${c}),CASE typeof(${c}) WHEN 'integer' THEN CAST(${c} AS TEXT) WHEN 'real' THEN printf('%!.17g',${c}) WHEN 'blob' THEN hex(${c}) ELSE ${c} END)`;}).join(',');
 return `(SELECT coalesce(json_group_array(json_array(${cells})),'[]') FROM ${ident(table.name)})`;
}
export function captureQuery(schema,tables,hasSequence){
 if(schema.some(s=>s.type==='table'&&/^CREATE\s+VIRTUAL/i.test(s.sql)))throw Error('Virtual tables require a supported native export.');
 return `SELECT json_object('schema',json((SELECT json_group_array(json_object('type',type,'name',name,'tbl_name',tbl_name,'sql',sql)) FROM (${schemaQuery}))), 'tables', json_object(${tables.map(t=>`${literal(t.name)},json(${tableRowsExpression(t)})`).join(',')}),'sequences',json(${hasSequence?"(SELECT coalesce(json_group_array(json_array(name,CAST(seq AS TEXT))),'[]') FROM sqlite_sequence)":"'[]'"})) AS snapshot`;
}
function value(cell){
 if(!Array.isArray(cell)||cell.length!==2)throw Error('Invalid cell.');
 const [type,text]=cell;
 if(type==='null'&&text===null)return null;
 if(type==='text'&&typeof text==='string')return text;
 if(type==='integer'&&typeof text==='string'&&/^-?\d+$/.test(text))return BigInt(text);
 if(type==='real'&&typeof text==='string'&&Number.isFinite(Number(text)))return Number(text);
 if(type==='blob'&&typeof text==='string'&&/^(?:[a-fA-F0-9]{2})*$/.test(text))return Buffer.from(text,'hex');
 throw Error('Invalid SQLite value.');
}
function sqlValue(cell){
 const v=value(cell);if(v===null)return 'NULL';if(typeof v==='string')return v.includes('\0')?`CAST(X'${Buffer.from(v).toString('hex')}' AS TEXT)`:literal(v);
 if(Buffer.isBuffer(v))return `X'${v.toString('hex')}'`;if(cell[0]==='real')return `CAST(${literal(cell[1])} AS REAL)`;return String(v);
}
function rowsHash(rows){return createHash('sha256').update(JSON.stringify(rows.map(row=>row.map(([type,text])=>[type,type==='real'?Number(text):text])).map(row=>JSON.stringify(row)).sort())).digest('hex');}
export function restoreAndVerify(snapshot){
 if(snapshot.version!==1||!Array.isArray(snapshot.schema)||!Array.isArray(snapshot.tableDefinitions))throw Error('Invalid snapshot.');
 const db=new DatabaseSync(':memory:');
 const sql=['PRAGMA foreign_keys=OFF;'];
 try{
  db.exec('PRAGMA foreign_keys=OFF');
  for(const entry of snapshot.schema.filter(s=>s.type==='table')){
   if(!/^CREATE\s+TABLE/i.test(entry.sql))throw Error('Unsupported table definition.');
   db.exec(entry.sql);sql.push(entry.sql+';');
  }
  const counts={};
  for(const table of snapshot.tableDefinitions){
   const rows=snapshot.tables[table.name];if(!Array.isArray(rows)||!table.columns.length)throw Error('Missing table data.');
   const prefix=`INSERT INTO ${ident(table.name)} (${table.columns.map(ident).join(',')}) VALUES `;
   const insert=db.prepare(prefix+'('+table.columns.map(()=>'?').join(',')+')');
   for(const row of rows){if(row.length!==table.columns.length)throw Error('Column mismatch.');insert.run(...row.map(value));sql.push(prefix+'('+row.map(sqlValue).join(',')+');');}
   counts[table.name]=rows.length;
  }
  if(snapshot.sequences?.length){
   db.exec('DELETE FROM sqlite_sequence');sql.push('DELETE FROM sqlite_sequence;');
   for(const [name,seq]of snapshot.sequences){if(!/^\d+$/.test(seq))throw Error('Invalid sequence.');db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(name,BigInt(seq));sql.push(`INSERT INTO sqlite_sequence(name,seq) VALUES(${literal(name)},${seq});`);}
  }
  // Restore triggers after rows so view-counter triggers do not count imported visits again.
  for(const type of ['index','view','trigger'])for(const entry of snapshot.schema.filter(s=>s.type===type)){db.exec(entry.sql);sql.push(entry.sql+';');}
  db.exec('PRAGMA foreign_keys=ON');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Restored integrity or foreign keys failed.');
  for(const table of snapshot.tableDefinitions){
   const restored=JSON.parse(db.prepare(`SELECT ${tableRowsExpression(table)} AS rows`).get().rows);
   if(rowsHash(restored)!==rowsHash(snapshot.tables[table.name]))throw Error('Restored table contents differ.');
  }
  // Also test the portable SQL, not only the structured JSON restore implementation.
  sql.push('PRAGMA foreign_keys=ON;');
  const sqlText=sql.join('\n');const second=new DatabaseSync(':memory:');
  try{
   second.exec(sqlText);
   if(second.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||second.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQL restore integrity failed.');
   for(const table of snapshot.tableDefinitions){const rows=JSON.parse(second.prepare(`SELECT ${tableRowsExpression(table)} AS rows`).get().rows);if(rowsHash(rows)!==rowsHash(snapshot.tables[table.name]))throw Error('SQL restore contents differ.');}
  }finally{second.close();}
  return {sql:sqlText,counts,integrity:'ok',foreignKeys:'ok',contentHashesMatch:true,portableSqlRestore:true};
 }finally{db.close();}
}

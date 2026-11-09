import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {schemaQuery,captureQuery,restoreAndVerify} from './d1-backup-snapshot.mjs';
const db=new DatabaseSync(':memory:');
try{
 db.exec(`CREATE TABLE parent(id INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT); CREATE TABLE child(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES parent(id),value); CREATE TABLE stats(n INTEGER); INSERT INTO stats VALUES(0); CREATE TRIGGER counter AFTER INSERT ON child BEGIN UPDATE stats SET n=n+1; END; INSERT INTO parent VALUES(1,'quote '' 한글'); INSERT INTO parent VALUES(99,'later deleted'); DELETE FROM parent WHERE id=99;`);
 const stmt=db.prepare('INSERT INTO child VALUES(?,?,?)');stmt.run(1,1,9007199254740993n);stmt.run(2,1,1.5);stmt.run(3,1,Buffer.from([0,255,2]));stmt.run(4,1,'nul\0text');stmt.run(5,1,null);
 const schema=db.prepare(schemaQuery).all();
 const tableDefinitions=schema.filter(s=>s.type==='table').map(t=>({name:t.name,columns:db.prepare('SELECT name FROM pragma_table_xinfo(?) WHERE hidden=0 ORDER BY cid').all(t.name).map(c=>c.name)}));
 const snapshot=JSON.parse(db.prepare(captureQuery(schema,tableDefinitions,true)).get().snapshot);Object.assign(snapshot,{version:1,tableDefinitions});
 const result=restoreAndVerify(snapshot);assert.equal(result.contentHashesMatch,true);assert.equal(result.portableSqlRestore,true);assert.equal(result.counts.child,5);
 assert.match(result.sql,/9007199254740993/);assert.match(result.sql,/sqlite_sequence/);
 const rebuilt=new DatabaseSync(':memory:');try{rebuilt.exec(result.sql);assert.equal(rebuilt.prepare('SELECT n FROM stats').get().n,5,'Imported rows must not run restored view triggers');assert.equal(rebuilt.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get('parent').seq,99,'Keep deleted AUTOINCREMENT high-water mark');}finally{rebuilt.close();}
 const broken=structuredClone(snapshot);broken.tables.child[0][1]=['integer','987'];assert.throws(()=>restoreAndVerify(broken),/foreign keys/);
 console.log('D1 snapshot: big integers, binary/NULL/NUL text, real values, FK rejection, trigger order, SQL restoration and AUTOINCREMENT preservation passed (synthetic data only).');
}finally{db.close();}

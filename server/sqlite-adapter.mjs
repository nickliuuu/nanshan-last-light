import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
export function sqliteAdapter(filename=':memory:'){
 const sql=new DatabaseSync(filename);sql.exec('PRAGMA journal_mode = WAL');
 return{
  sql,
  prepare(query){return{bind(...args){const p=sql.prepare(query);return{
   first(){return p.get(...args)||null;},
   all(){return{results:p.all(...args)};},
   run(){const r=p.run(...args);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},
  };}};},
  batch(statements){sql.exec('BEGIN');try{const r=statements.map(s=>s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}},
 };
}
export function migrateLocal(db,directory){
 db.sql.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
 for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.sql')).sort()){
  if(db.sql.prepare('SELECT name FROM local_migrations WHERE name=?').get(file))continue;
  db.sql.exec(fs.readFileSync(directory+'/'+file,'utf8'));db.sql.prepare('INSERT INTO local_migrations VALUES(?)').run(file);
 }
}

import assert from 'node:assert/strict';
import {encryptBackup,decryptBackup} from './backup-vault.mjs';
const password='synthetic-backup-passphrase-only';
const files={'member-schema.sql':Buffer.from('CREATE TABLE test(id int);'),'community.sql':Buffer.from("INSERT INTO test VALUES (1); -- 한글")};
const sealed=encryptBackup(files,password);
assert.ok(!sealed.includes(Buffer.from('CREATE TABLE')));
assert.deepEqual(Object.fromEntries(decryptBackup(sealed,password)),files);
assert.notDeepEqual(encryptBackup(files,password),sealed,'Fresh salt and nonce for each archive');
assert.throws(()=>decryptBackup(sealed,'another-long-password'),/auth|authenticate/i);
for(const i of [0,8,24,36,sealed.length-1]){const tampered=Buffer.from(sealed);tampered[i]^=1;assert.throws(()=>decryptBackup(tampered,password));}
assert.throws(()=>encryptBackup({'../secret':Buffer.from('no')},password),/Unsafe/);
assert.throws(()=>encryptBackup({},password),/Empty/);
assert.throws(()=>encryptBackup(files,'short'),/16/);
console.log('Backup vault: portable round trip, fresh nonce, wrong-password refusal, tamper detection and path checks passed (synthetic data only).');

import {encryptBackup,decryptBackup} from './backup-vault.mjs';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
let input='';for await(const chunk of process.stdin)input+=chunk;
const config=JSON.parse(input);input='';
const archive=encryptBackup({'recovery-private-key.pem':Buffer.from(config.privateKey)},config.password);
decryptBackup(archive,config.password);
await writeFile(resolve('backups/sianaly-recovery-key.sianaly-backup'),archive,{flag:'wx',mode:0o600});
console.log('Portable encrypted recovery key verified. No key material printed.');

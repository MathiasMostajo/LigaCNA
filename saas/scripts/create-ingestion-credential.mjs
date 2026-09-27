import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const [phoneId,slug='liga-cna']=process.argv.slice(2);
if(!/^[0-9]{5,32}$/.test(phoneId??'') || !/^[a-z0-9-]{1,120}$/.test(slug)) {
  console.error('Usage: node scripts/create-ingestion-credential.mjs WHATSAPP_BUSINESS_PHONE_NUMBER_ID [competition-slug]'); process.exit(1);
}
const token=`cna_${randomBytes(32).toString('base64url')}`;
const hash=createHash('sha256').update(token).digest('hex');
const directory=resolve('.local',`ingestion-${phoneId}`);
await mkdir(directory,{recursive:true});
// wx deliberately refuses to overwrite an existing credential. Rotation is explicit.
await writeFile(resolve(directory,'make-credential.txt'),token+'\n',{flag:'wx',mode:0o600});
await writeFile(resolve(directory,'provision.sql'),`-- Apply using a privileged database connection. This file contains only the token hash.
-- Existing phone-number bindings are not silently rotated.
insert into public.cna_ingestion_clients(name,token_sha256,phone_number_id,competition_id)
select 'Make WhatsApp','${hash}','${phoneId}',id from public.cna_competitions where slug='${slug}'
returning id,phone_number_id,competition_id;
`,{flag:'wx',mode:0o600});
console.log(`Credential and provisioning SQL saved in ${directory}. Keep the credential in Make's secure connection settings; never commit it.`);


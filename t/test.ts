import { normalisasiNomor } from '../lib/telephony/phone';
import { parseNamaBerkas, cocokkanRekaman } from '../lib/telephony/match';
import { rekonsiliasiHarian } from '../lib/telephony/reconcile';
import { parseDeviceCallLog } from '../lib/telephony/adapters/manual';

let ok=0, gagal=0;
const cek=(n:string,a:unknown,b:unknown)=>{
  const p=JSON.stringify(a)===JSON.stringify(b);
  if(p){ok++;} else {gagal++; console.log(`  ✗ ${n}\n     dapat: ${JSON.stringify(a)}\n     harap: ${JSON.stringify(b)}`);}
};

console.log("\n== normalisasi nomor ==");
cek("0812 lokal",      normalisasiNomor('0812-3456-789'),   '628123456789');
cek("+62 spasi",       normalisasiNomor('+62 812 3456 789'),'628123456789');
cek("62 polos",        normalisasiNomor('628123456789'),    '628123456789');
cek("tanpa awalan",    normalisasiNomor('8123456789'),      '628123456789');
cek("0062",            normalisasiNomor('00628123456789'),  '628123456789');
cek("telepon rumah",   normalisasiNomor('076112345'),        null);
cek("prefiks palsu",   normalisasiNomor('0899123456789'),   '62899123456789');
cek("kosong",          normalisasiNomor(''),                 null);
cek("terlalu pendek",  normalisasiNomor('0812345'),          null);

console.log("\n== parsing nama berkas perekam ==");
const kasus: Array<[string,string|null]> = [
  ['+628123456789_20260821_143022.m4a','628123456789'],
  ['20260821_143022_+628123456789.amr','628123456789'],
  ['20260821143022_628123456789.mp3','628123456789'],
  ['Call_628123456789_260821_143022.m4a','628123456789'],
  ['Call recording Budi_628123456789_20260821143022.m4a','628123456789'],
  ['628123456789 2026-08-21 14-30-22.mp3','628123456789'],
];
for(const [nama,harap] of kasus){
  const p=parseNamaBerkas(nama);
  cek(nama.slice(0,34), p.phoneE164, harap);
  if(!p.startedAt){gagal++; console.log(`  ✗ waktu tidak terbaca: ${nama}`);} else ok++;
}

console.log("\n== pencocokan rekaman ==");
const t=(s:string)=>new Date(s);
const kandidat=[
  {id:'s1',phoneE164:'628123456789',startedAt:t('2026-08-21T07:30:00Z')}, // 14:30 WIB
  {id:'s2',phoneE164:'628999888777',startedAt:t('2026-08-21T08:00:00Z')},
];
cek("cocok tunggal",
  cocokkanRekaman(parseNamaBerkas('+628123456789_20260821_143022.m4a'),kandidat,120).confidence,'high');
cek("nomor tak dikenal",
  cocokkanRekaman(parseNamaBerkas('+628111222333_20260821_143022.m4a'),kandidat,120).confidence,'unmatched');
cek("dua kandidat -> conflict",
  cocokkanRekaman(parseNamaBerkas('+628123456789_20260821_143022.m4a'),
    [...kandidat,{id:'s3',phoneE164:'628123456789',startedAt:t('2026-08-21T07:30:50Z')}],120).confidence,'conflict');
cek("jauh -> low",
  cocokkanRekaman(parseNamaBerkas('+628123456789_20260821_143500.m4a'),kandidat,120).confidence,'low');

console.log("\n== parse CSV call log perangkat ==");
const csv=`Number,Name,Type,Date,Duration
0812-3456-789,Budi,Outgoing,21/08/2026 14:30:22,95
628999888777,Siti,Outgoing,21/08/2026 15:00:00,0
08199999999,Istri,Outgoing,21/08/2026 12:00:00,300
628123456789,Budi,Incoming,21/08/2026 16:00:00,45`;
const dikenal=new Set(['628123456789','628999888777']);
const hasil=parseDeviceCallLog(csv,dikenal);
cek("baris relevan (pribadi & masuk dibuang)",hasil.records.length,2);
cek("baris dibuang",hasil.barisDibuang,2);
cek("outcome durasi>0",hasil.records[0]!.outcome,'answered');
cek("outcome durasi=0",hasil.records[1]!.outcome,'no_answer');

console.log("\n== rekonsiliasi: deteksi panggilan fiktif ==");
const r=rekonsiliasiHarian({
  agentId:'a1',tanggal:'2026-08-21',
  crmLogs:[
    {id:'L1',phoneE164:'628123456789',dicatatPada:t('2026-08-21T07:32:00Z'),durasiDilaporkan:95},
    {id:'L2',phoneE164:'628999888777',dicatatPada:t('2026-08-21T08:05:00Z'),durasiDilaporkan:0},
    {id:'L3',phoneE164:'628111222333',dicatatPada:t('2026-08-21T09:00:00Z'),durasiDilaporkan:60}, // FIKTIF
  ],
  deviceCalls:[
    {phoneE164:'628123456789',mulaiPada:t('2026-08-21T07:30:00Z'),durasiDetik:95},
    {phoneE164:'628999888777',mulaiPada:t('2026-08-21T08:00:00Z'),durasiDetik:0},
    {phoneE164:'628555444333',mulaiPada:t('2026-08-21T10:00:00Z'),durasiDetik:120}, // tidak dicatat
  ],
});
cek("cocok",r.cocok,2);
cek("diduga fiktif",r.didugaFiktif,1);
cek("id fiktif",r.detail.logFiktif,['L3']);
cek("tidak dicatat",r.tidakDicatat,1);
cek("skor integritas",r.skorIntegritas,66.67);
cek("status",r.status,'Bermasalah');

console.log("\n== jendela asimetris: form disimpan 40 menit setelah panggilan ==");
const r2=rekonsiliasiHarian({
  agentId:'a1',tanggal:'2026-08-21',
  crmLogs:[{id:'L1',phoneE164:'628123456789',dicatatPada:t('2026-08-21T08:10:00Z'),durasiDilaporkan:null}],
  deviceCalls:[{phoneE164:'628123456789',mulaiPada:t('2026-08-21T07:30:00Z'),durasiDetik:95}],
});
cek("masih dianggap cocok (bukan tuduhan palsu)",r2.cocok,1);

console.log("\n== panggilan SETELAH form disimpan harus ditolak ==");
const r3=rekonsiliasiHarian({
  agentId:'a1',tanggal:'2026-08-21',
  crmLogs:[{id:'L1',phoneE164:'628123456789',dicatatPada:t('2026-08-21T07:00:00Z'),durasiDilaporkan:null}],
  deviceCalls:[{phoneE164:'628123456789',mulaiPada:t('2026-08-21T07:30:00Z'),durasiDetik:95}],
});
cek("tidak cocok",r3.cocok,0);

console.log(`\n${gagal===0?'✅':'❌'}  ${ok} lulus, ${gagal} gagal\n`);

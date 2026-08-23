import { HASIL_PANGGILAN, SUB_ALASAN_TIDAK_LAYAK } from '../lib/call-outcome/catalog';
import { dariPohonLama, validasiHasil, efekSamping, adalahRpc, statusKontakDari, semuaKode } from '../lib/call-outcome/derive';

let ok=0, gagal=0;
const cek=(n:string,a:unknown,b:unknown)=>{
  const p=JSON.stringify(a)===JSON.stringify(b);
  if(p)ok++; else {gagal++; console.log(`  ✗ ${n}\n     dapat: ${JSON.stringify(a)}\n     harap: ${JSON.stringify(b)}`);}
};

console.log("\n== bentuk katalog ==");
cek("jumlah opsi = 12", HASIL_PANGGILAN.length, 12);
cek("kode unik", new Set(semuaKode()).size, 12);
cek("hanya TIDAK_MEMENUHI_SYARAT yang minta sub_alasan",
  HASIL_PANGGILAN.filter(h=>(h.wajib as readonly string[]).includes('sub_alasan')).map(h=>h.kode),
  ['TIDAK_MEMENUHI_SYARAT']);
cek("RPC = 7 opsi", HASIL_PANGGILAN.filter(h=>h.rpc).length, 7);

console.log("\n== 13 alasan Unprospect lama tidak ada yang hilang ==");
const LAMA = ['Angsuran Masih Banyak','Dana Cari Rendah','Dana Sudah Cair','Inquiry',
  'Invalid Data','Kendaraan Masih Kredit','Konfirmasi Pasangan','Masih Pikir-pikir',
  'No Coverage Area','No Need Money','Pricing','Service','Others'];
for(const d of LAMA){
  const r = dariPohonLama({level_1:'CONNECTED',level_2:'Contacted',level_3:'Present',level_4:'Unprospect',level_4_detail:d});
  const sah = semuaKode().includes(r.kode);
  if(!sah){gagal++;console.log(`  ✗ '${d}' -> kode tak dikenal ${r.kode}`);} else ok++;
  if(r.kode==='TIDAK_MEMENUHI_SYARAT' && !r.subAlasan){gagal++;console.log(`  ✗ '${d}' butuh sub_alasan tapi kosong`);}
}
cek("Kendaraan Masih Kredit -> BPKB_MASIH_KREDIT",
  dariPohonLama({level_4:'Unprospect',level_4_detail:'Kendaraan Masih Kredit'}).subAlasan,'BPKB_MASIH_KREDIT');

console.log("\n== cabang lain pohon lama ==");
cek("Interest -> MINAT", dariPohonLama({level_3:'Present',level_4:'Interest'}).kode,'MINAT');
cek("Prospect -> MINAT (dulu tak berkonsekuensi)", dariPohonLama({level_3:'Present',level_4:'Prospect'}).kode,'MINAT');
cek("Busy Tone BUKAN lagi 'connected'", dariPohonLama({level_1:'CONNECTED',level_2:'Uncontacted',level_3:'Busy Tone'}).kode,'TIDAK_DIANGKAT');
cek("Mailbox -> TIDAK_DIANGKAT", dariPohonLama({level_1:'CONNECTED',level_2:'Uncontacted',level_3:'Mailbox'}).kode,'TIDAK_DIANGKAT');
cek("Konsumen Meninggal -> JANGAN_HUBUNGI", dariPohonLama({level_2:'Invalid Number',level_3:'Konsumen Meninggal'}).kode,'JANGAN_HUBUNGI');
cek("No Salah -> NOMOR_SALAH", dariPohonLama({level_2:'Invalid Number',level_3:'No Salah'}).kode,'NOMOR_SALAH');
cek("Callback -> MINTA_TELEPON_LAIN", dariPohonLama({level_3:'Unpresent',level_4:'Callback'}).kode,'MINTA_TELEPON_LAIN');
cek("Meeting -> JANJI_TEMU", dariPohonLama({level_3:'Unpresent',level_4:'Meeting'}).kode,'JANJI_TEMU');

console.log("\n== definisi RPC (yang dulu rusak) ==");
cek("MINAT itu RPC", adalahRpc('MINAT'), true);
cek("TIDAK_MEMENUHI_SYARAT itu RPC (kita bicara dengan orangnya)", adalahRpc('TIDAK_MEMENUHI_SYARAT'), true);
cek("TIDAK_DIANGKAT BUKAN RPC", adalahRpc('TIDAK_DIANGKAT'), false);
cek("BUKAN_ORANGNYA BUKAN RPC", adalahRpc('BUKAN_ORANGNYA'), false);
cek("NOMOR_SALAH BUKAN RPC", adalahRpc('NOMOR_SALAH'), false);

console.log("\n== validasi field wajib ==");
cek("MINAT tanpa simulasi ditolak", validasiHasil({kode:'MINAT'}).valid, false);
cek("MINAT dengan simulasi lolos",
  validasiHasil({kode:'MINAT',simulasiNominal:50_000_000,simulasiTenor:24}).valid, true);
cek("TIDAK_MEMENUHI_SYARAT tanpa sub_alasan ditolak", validasiHasil({kode:'TIDAK_MEMENUHI_SYARAT'}).valid, false);
cek("dengan sub_alasan lolos",
  validasiHasil({kode:'TIDAK_MEMENUHI_SYARAT',subAlasan:'BPKB_MASIH_KREDIT'}).valid, true);
const besok = new Date(Date.now()+86400000).toISOString();
cek("JANJI_TEMU tanpa tanggal ditolak", validasiHasil({kode:'JANJI_TEMU'}).valid, false);
cek("JANJI_TEMU dengan tanggal lolos", validasiHasil({kode:'JANJI_TEMU',tanggalFollowup:besok}).valid, true);
cek("tanggal masa lalu ditolak",
  validasiHasil({kode:'JANJI_TEMU',tanggalFollowup:'2020-01-01'}).valid, false);
cek("TIDAK_DIANGKAT tanpa apa-apa lolos", validasiHasil({kode:'TIDAK_DIANGKAT'}).valid, true);
cek("PIKIR_PIKIR tanpa tanggal ditolak", validasiHasil({kode:'PIKIR_PIKIR'}).valid, false);
cek("PIKIR_PIKIR dengan tanggal lolos",
  validasiHasil({kode:'PIKIR_PIKIR',tanggalFollowup:besok}).valid, true);

console.log("\n== efek samping ==");
cek("PIKIR_PIKIR tanpa tanggal -> tidak ada jadwal otomatis (wajib diisi mitra)",
  efekSamping({kode:'PIKIR_PIKIR'}).jadwalkanPada, null);
cek("PIKIR_PIKIR dengan tanggal -> terjadwal sesuai input",
  efekSamping({kode:'PIKIR_PIKIR',tanggalFollowup:'2026-08-24'}).jadwalkanPada?.toISOString().slice(0,10),'2026-08-24');
cek("JANGAN_HUBUNGI masuk DNC", efekSamping({kode:'JANGAN_HUBUNGI'}).masukDnc, true);
cek("MINAT tidak masuk DNC", efekSamping({kode:'MINAT'}).masukDnc, false);
cek("MINAT dorong kirim WA", efekSamping({kode:'MINAT'}).dorongKirimWa, true);
cek("MINAT -> Hot Lead", statusKontakDari('MINAT'),'Hot Lead');
cek("PIKIR_PIKIR -> Warm", statusKontakDari('PIKIR_PIKIR'),'Warm');
cek("NOMOR_SALAH -> Invalid", statusKontakDari('NOMOR_SALAH'),'Invalid');

console.log("\n== beban input mitra ==");
const rata = HASIL_PANGGILAN.reduce((s,h)=>s+1+(h.wajib as readonly string[]).length,0)/HASIL_PANGGILAN.length;
console.log(`  rata-rata interaksi per panggilan: ${rata.toFixed(2)}  (pohon lama: 4,00)`);
console.log(`  pada 80 panggilan/hari: ${Math.round(rata*80)} vs 320 interaksi`);
cek("rata-rata di bawah 2 interaksi", rata < 2, true);

console.log(`\n${gagal===0?'✅':'❌'}  ${ok} lulus, ${gagal} gagal\n`);

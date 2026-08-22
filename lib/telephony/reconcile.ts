// lib/telephony/reconcile.ts
//
// INI berkas yang membuat opsi termurah tetap layak dipakai.
//
// Rekaman saja tidak mendeteksi apa pun: mitra yang mengarang panggilan
// tinggal tidak mengunggah rekamannya. Yang mendeteksi adalah MENGADU
// dua sumber:
//
//   call_logs      — apa yang mitra katakan terjadi
//   call log HP    — apa yang benar-benar dilakukan perangkat
//
// Baris CRM tanpa pasangan di call log perangkat = panggilan fiktif.

export interface CrmCallLog {
  id: string;
  phoneE164: string;
  /** Kapan mitra MENYIMPAN form — bukan kapan panggilan dimulai. Lihat catatan jendela di bawah. */
  dicatatPada: Date;
  durasiDilaporkan: number | null;
}

export interface DeviceCall {
  phoneE164: string;
  mulaiPada: Date;
  durasiDetik: number;
}

export interface BarisRekonsiliasi {
  agentId: string;
  tanggal: string;
  crmDicatat: number;
  perangkatTercatat: number;
  cocok: number;
  didugaFiktif: number;
  tidakDicatat: number;
  selisihDurasiDetik: number;
  skorIntegritas: number;
  status: 'Normal' | 'Perlu Ditinjau' | 'Bermasalah';
  detail: {
    logFiktif: string[];                  // id call_logs tanpa bukti perangkat
    panggilanTidakDicatat: DeviceCall[];  // ditelepon tapi tidak dicatat
  };
}

/**
 * Jendela pencocokan sengaja ASIMETRIS.
 *
 * Mitra menelepon lebih dulu, baru mengisi form. Jeda 30 detik sampai
 * beberapa menit itu normal, dan pada panggilan panjang bisa lebih lama.
 * Sebaliknya, panggilan yang dimulai SETELAH form disimpan hampir mustahil.
 *
 * Jendela simetris akan menghasilkan tuduhan palsu — dan tuduhan palsu
 * ke mitra jauh lebih merusak daripada satu panggilan fiktif yang lolos.
 */
const JENDELA_SEBELUM_DETIK = 45 * 60;  // panggilan boleh dimulai s/d 45 menit sebelum dicatat
const JENDELA_SESUDAH_DETIK = 3 * 60;   // toleransi jam perangkat yang meleset

export function rekonsiliasiHarian(params: {
  agentId: string;
  tanggal: string;
  crmLogs: CrmCallLog[];
  deviceCalls: DeviceCall[];
}): BarisRekonsiliasi {
  const { agentId, tanggal, crmLogs, deviceCalls } = params;

  const belumTerpakai = deviceCalls.map((d, i) => ({ d, i, terpakai: false }));
  const logFiktif: string[] = [];
  let cocok = 0;
  let selisihDurasi = 0;

  for (const log of crmLogs) {
    const dicatat = log.dicatatPada.getTime();

    const kandidat = belumTerpakai
      .filter(x => !x.terpakai && x.d.phoneE164 === log.phoneE164)
      .map(x => ({ x, selisih: (dicatat - x.d.mulaiPada.getTime()) / 1000 }))
      .filter(({ selisih }) => selisih >= -JENDELA_SESUDAH_DETIK && selisih <= JENDELA_SEBELUM_DETIK)
      // Panggilan terdekat sebelum form disimpan adalah pasangan paling masuk akal
      .sort((a, b) => Math.abs(a.selisih) - Math.abs(b.selisih));

    if (kandidat.length === 0) {
      logFiktif.push(log.id);
      continue;
    }

    const pilih = kandidat[0]!;
    pilih.x.terpakai = true;
    cocok++;

    if (log.durasiDilaporkan != null) {
      selisihDurasi += Math.abs(log.durasiDilaporkan - pilih.x.d.durasiDetik);
    }
  }

  const panggilanTidakDicatat = belumTerpakai.filter(x => !x.terpakai).map(x => x.d);

  const skorIntegritas = crmLogs.length === 0
    ? 100
    : Math.round((cocok / crmLogs.length) * 10000) / 100;

  // Ambang sengaja longgar di awal. Call log perangkat memang bisa bolong
  // (HP mati, aplikasi ekspor gagal). Yang kamu kejar adalah POLA berulang,
  // bukan satu hari yang jelek.
  const status: BarisRekonsiliasi['status'] =
    skorIntegritas >= 95 ? 'Normal'
    : skorIntegritas >= 80 ? 'Perlu Ditinjau'
    : 'Bermasalah';

  return {
    agentId,
    tanggal,
    crmDicatat: crmLogs.length,
    perangkatTercatat: deviceCalls.length,
    cocok,
    didugaFiktif: logFiktif.length,
    tidakDicatat: panggilanTidakDicatat.length,
    selisihDurasiDetik: Math.round(selisihDurasi),
    skorIntegritas,
    status,
    detail: { logFiktif, panggilanTidakDicatat },
  };
}

/**
 * Pola berulang jauh lebih bermakna daripada satu hari buruk.
 * Panggil ini sebelum mengambil tindakan apa pun terhadap mitra.
 */
export function polaMencurigakan(riwayat: BarisRekonsiliasi[], minHari = 5): {
  bermasalah: boolean;
  rataSkor: number;
  hariBermasalah: number;
  catatan: string;
} {
  if (riwayat.length < minHari) {
    return { bermasalah: false, rataSkor: 100, hariBermasalah: 0,
             catatan: `Data baru ${riwayat.length} hari — belum cukup untuk menyimpulkan apa pun.` };
  }

  const rataSkor = riwayat.reduce((s, r) => s + r.skorIntegritas, 0) / riwayat.length;
  const hariBermasalah = riwayat.filter(r => r.status === 'Bermasalah').length;
  const bermasalah = rataSkor < 85 || hariBermasalah >= 3;

  return {
    bermasalah,
    rataSkor: Math.round(rataSkor * 100) / 100,
    hariBermasalah,
    catatan: bermasalah
      ? `Rata-rata integritas ${rataSkor.toFixed(1)}% selama ${riwayat.length} hari, ${hariBermasalah} hari bermasalah. Dengarkan rekamannya lebih dulu sebelum bicara ke mitra.`
      : `Rata-rata integritas ${rataSkor.toFixed(1)}% — dalam batas wajar.`,
  };
}

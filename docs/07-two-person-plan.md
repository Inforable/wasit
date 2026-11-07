# Rencana dua orang dan Codex — Wasit 4.1

Dua orang adalah pemilik keputusan, review dan integrasi. Masing-masing memakai Codex untuk implementasi
modul, tes, review dan perbaikan. Kapasitas tidak dihitung sebagai dua penulis kode manual.

## Pemilik

| Orang | Tanggung jawab | Tiket |
|---|---|---|
| A | Domain/uang, kontrak, persistence/auth/API, ranking, buyer policy, agreement, bill check, lifecycle | BE-01–16; AG-03/06/08 |
| B | Seluruh UI, model adapter/extraction, provider simulator, OCR/formatter/explainer, evaluasi | FE-01–16; AG-01/02/04/05/07 |

A memiliki schema bersama, router dan DB migrations. B memiliki komponen/styles, client dan adapter model.
Perubahan kontrak ditinjau keduanya sebelum consumer diubah. Tugas independen boleh berjalan di worktree/branch terpisah.
Jangan membiarkan dua agent mengedit file pusat yang sama bersamaan.

## Gate integrasi

| Gate | A dan agent | B dan agent | Bukti selesai |
|---|---|---|---|
| G0 foundation | BE-01; DB/version constraints dan kontrak | FE-01, komponen dan fixture | check lulus; UI/health dapat dibuka |
| G1 chat manusia | BE-02/03/04; production persistent store | FE-03/04/05; AG-01/02 | Balasan provider masuk snapshot tanpa bocor budget |
| G2 pilihan/negosiasi | BE-05/06/07; AG-03/06/08 | FE-06/07; AG-04/07 | Quote bersumber, group setara, counter sah dan preferensi terlihat |
| G3 agreement | BE-08 dan tes race/stale/ack | FE-08/09 | Dua penerimaan mengaktifkan versi 1 |
| G4 perubahan | BE-09 dan limit/quantity/source | FE-10; AG-05 | Versi 1 tetap berlaku saat versi 2 pending; limit baru eksplisit |
| G5 produk lengkap | BE-10–15 dan kategori lain | FE-11–16, provider data, demo/eval | Alur lintas role/kategori dan lifecycle teruji |
| Release | BE-16, persistent deployment/observability | Mobile/English/tema dan latihan | URL/commit/status DNS dan batas fitur dicatat |

G1–G4 menjadi cerita utama, bukan alasan menghapus kategori/fitur lain karena jumlah orang.
G0 deployment publik adalah fondasi; G1 transactional production menunggu store eksternal dan auth.
Billing/settlement tidak boleh diaktifkan pada local-file storage Vercel.

## Paket tugas Codex

Setiap tugas memuat tujuan, input/output yang dibekukan, ownership file, dependensi, acceptance criteria,
perintah verifikasi dan hasil yang harus diperlihatkan. Tugas tidak selesai pada “kode sudah ditulis”.

Contoh pemisahan:
- Agent domain membuat normalisasi uang/unit dan tesnya.
- Agent comparison memakai kontrak Quote untuk group/ranking.
- Agent agreement memakai Terms/Acceptance untuk transaksi.
- Agent UI memakai fixture yang sama sambil endpoint berjalan.
- Agent reviewer memeriksa sumber angka, data privat dan stale/race secara terpisah.

Owner mengintegrasikan hasil, menjalankan pemeriksaan relevan dan menyelesaikan konflik konsep.
Status: Todo → Doing → Ready for integration → Done.
Partial berarti fondasi sebagian tersedia; tidak dihitung sebagai fitur terintegrasi.

## Status integrasi aktual

Backend request, quote, comparison, versioned agreement, bill, lifecycle and simulation services are implemented and tested. Named accounts and private profiles are implemented; hosted persistence remains open under BE-02. Runtime OpenAI adapters have actual live-test evidence in addition to mocked boundary tests.

Consumer/provider/agreement screens have real Chrome verification. Shared shell, history, onboarding and motion are being aligned with the specified interaction contract; unfinished frontend gates remain explicit in their tickets. One integrator owns shared contracts/API while delegated agents own isolated modules.

The public UI/API release is available at https://wasit-id.vercel.app. Production transactions still require completed Neon acceptance/provisioning and hosted checks. Local success is not production database evidence.

## Bukti Codex

Simpan task, input/commit, file yang berubah, hasil tes, kegagalan, perbaikan dan review manusia.
Pilih contoh parser/provenance, acceptance race dan UI integration yang benar-benar terjadi.
Jangan membuat persentase kontribusi atau riwayat build buatan.

---
title: Wasit — service comparison and agreed costs
version: 4.1
updated: 2026-11-07
status: product specification
---

# Wasit: Product Requirements Document

## 1. Positioning dan tujuan

**Wasit membantu pelanggan membandingkan dan menegosiasikan jasa rumah, kemudian menjaga kepastian biaya pekerjaan yang disepakati sampai selesai.**

Hipotesis produk: pelanggan ingin mempertimbangkan harga, waktu, cakupan, dan reputasi sebelum memilih; setelah memilih, mereka ingin memahami biaya yang berlaku dan menyetujui perubahan sebelum pekerjaan tambahan dilakukan. Hipotesis ini perlu divalidasi melalui pengguna dan penyedia; bukan klaim hasil riset yang sudah tersedia.

Dua kebutuhan tersebut menjadi satu perjalanan: **Compare → Negotiate → Agree → Verify changes → Complete**.

English positioning:
> **Compare service offers. Negotiate with confidence. Stay in control of the final bill.**

Brand: **Wasit**. Tagline: **Every fair price gets a referee.**

Kepastian harga berarti harga, cakupan, satuan dan jumlah pada versi yang diterima kedua pihak berlaku untuk pekerjaan tersebut. Ini tidak menjanjikan semua kerusakan akan selesai dengan biaya dasar, tidak membuktikan diagnosis, dan tidak menghalangi tindakan pihak di luar aplikasi.

## 2. Prinsip produk

1. Biaya yang dikutip, perkiraan, pekerjaan opsional, dan komitmen pembayaran harus berbeda.
2. Harga belum diketahui tetap null; nol hanya berarti gratis atau termasuk secara eksplisit.
3. Bandingkan penawaran dengan cakupan, satuan, jumlah, lokasi dan jendela waktu yang setara.
4. Agen pembeli mewakili preferensi pelanggan. Pemeriksa kesepakatan menerapkan aturan yang sama pada kedua pihak.
5. Setiap angka dan klaim layanan memiliki sumber. Model tidak menjadi authority uang, izin atau persetujuan.
6. Kedua pihak menerima versi yang sama sebelum kesepakatan atau perubahan berlaku.
7. Pekerjaan tambahan tidak aktif hanya karena lolos pemeriksaan tagihan atau checkbox lokal.
8. Semua alur inti memiliki fallback tanpa model. Simulasi dan asumsi diberi label.
9. Produk, error, penjelasan agen dan komentar kode memakai English; input Indonesia tetap didukung.
10. Kapasitas implementasi dibantu Codex. Scope dinilai dari manfaat dan koherensi produk, bukan jumlah builder manusia saja.

## 3. Scope dan role

Lima kategori menggunakan mesin yang sama: AC service, washing machine repair, plumbing, electrical service, dan home cleaning. Katalog per kategori menetapkan pekerjaan dasar, item termasuk, tambahan, satuan dan normalisasi jumlah.

| Area | Scope |
|---|---|
| Konsumen | Profil, prioritas, permintaan, klarifikasi, perbandingan, negosiasi, takeover, pilihan, persetujuan versi, cek tagihan, pembayaran simulasi, konfirmasi, ulasan/sengketa |
| Penyedia | Consent, profil/area/jam, daftar harga, inbox/chat, penerimaan/penolakan versi, proposal tambahan, pekerjaan, tanggapan sengketa/ulasan |
| Demo | Penyedia skrip/model berlabel Simulation, minimal satu penyedia manusia melalui akun atau tautan cabang |
| Komunikasi | Chat aplikasi; WhatsApp dan telepon sungguhan di luar scope |
| Pembayaran | Ledger simulasi berlabel; tidak memindahkan atau menahan uang sungguhan |
| Data | Jakarta untuk demo; rating awal, harga seed dan koordinat diberi label Team assumption [A] |
| Foto tagihan | Membaca baris dengan model, selalu dikonfirmasi pengguna sebelum diperiksa |
| Di luar scope | Diagnosis ahli otomatis, jaminan harga pasar, identitas/tanda tangan hukum terverifikasi, uang sungguhan, mediator manusia operasional |

Satu kategori AC menjadi alur demo utama. Empat kategori lain adalah kemampuan produk yang harus diuji sebelum ditampilkan sebagai tersedia, bukan tombol dengan backend kosong.

## 4. Alur dan status

Permintaan → formatter/klarifikasi → discovery → RFQ privat → negosiasi paralel → ekstraksi/provenance → perbandingan → pilih quote/revision → draf agreement → submit → dua penerimaan → versi aktif → cek tagihan → proposal perubahan → dua penerimaan versi baru → penyelesaian.

Status request: submitted, formatting, needs_clarification, contacting, negotiating, evaluating, awaiting_customer, no_match, locked, failed.

Status quote: needs_detail, ready, over_budget. Ketersediaan dan kesetaraan scope dicatat terpisah; ready tidak berarti otomatis dapat dibandingkan dengan setiap quote lain.

Status versi: draft → pending → active → superseded; draft/pending dapat menjadi rejected. Deal memiliki active_version_id dan pending_version_id. Pending pointer mencakup draf yang belum disubmit. Maksimal satu active dan satu draft/pending.

Lifecycle pekerjaan dan pembayaran terpisah dari versi terms. Penerimaan versi bukan bukti pembayaran.

## 5. Permintaan dan discovery

Input bahasa sehari-hari, kategori, lokasi umum, jadwal WIB, jumlah unit dan prioritas. Formatter mengisi fakta eksplisit; fakta ambigu ditanyakan dengan chip dan opsi Other. Angka “sekitar” adalah target, bukan budget maksimal. Budget maksimal harus dikonfirmasi eksplisit sebelum booking.

Budget maksimal bersifat privat. Target untuk negosiasi hanya boleh dikirim jika konsumen mengizinkannya secara eksplisit; tidak diturunkan diam-diam dari batas maksimal.

Nama, HP dan alamat rinci tidak masuk konteks negosiasi model atau payload provider. Bobot prioritas dibekukan per request.

Discovery memeriksa consent, kategori, area dan ketersediaan. Consent berlaku termasuk demo. Maksimal lima penyedia dihubungi; alasan skip terlihat. Tidak ada klaim supply pasar jika penyedia adalah anggota tim atau simulasi.

RFQ hanya membawa scope, lokasi umum, jumlah dan jadwal. Setiap provider memiliki cabang privat.

## 6. Model biaya dan provenance

| Kind quote | Arti | Pengaruh total |
|---|---|---|
| fixed | Pekerjaan dasar/fee yang dikutip secara eksplisit | Masuk fixed_total |
| included | Sudah termasuk dengan harga nol eksplisit | Tidak menambah total |
| optional | Harga diketahui tetapi pekerjaan belum dipesan | Tidak masuk fixed_total |
| unknown | Harga/scope belum cukup jelas | Tidak dianggap nol atau diisi buku harga |

Setiap line menyimpan item_code, label, kind, unit, quantity, unit_price, condition dan source {message_id, snippet}. Source harus pesan provider pada cabang yang sama. ID baris ditulis server.

Server memvalidasi hubungan item, angka, satuan, jumlah, kutipan dan pengirim. Angka yang kebetulan muncul dalam pesan bukan bukti pasangan item-harga benar. Konsumen tidak dapat menjadi sumber harga provider. Konflik yang tidak eksplisit direvisi menjadi needs_detail; perubahan harga eksplisit membuat revision baru dengan riwayat.

fixed_total = jumlah quantity × unit_price untuk fixed, setelah seluruh biaya wajib diketahui. Required scope yang hilang, transport tidak diketahui, atau satuan ambigu membuat total belum lengkap. Known subtotal boleh ditampilkan sebagai subtotal, bukan harga final.

ready memerlukan scope dasar lengkap, biaya wajib eksplisit, satuan/jumlah jelas dan jadwal terkonfirmasi. Jika fixed_total melebihi max_budget, quote over_budget: boleh dinegosiasikan tetapi tidak dapat dipilih sebelum memenuhi batas atau budget diubah eksplisit.

Optional/unknown yang tidak menyangkut pekerjaan dasar dapat tetap ada pada quote ready, ditampilkan sebagai Not ordered / Price not yet quoted.

## 7. Perbandingan, ranking dan negosiasi

### 7.1 Perbandingan yang setara

Buat comparison group dari kategori, scope wajib, unit/jumlah, lokasi dan jendela waktu yang sama. Item wajib yang berbayar pada provider A tetapi termasuk pada B tetap dihitung dalam total cakupan yang sama.

Hanya quote lengkap dalam group yang sama mendapat ranking. Yang belum setara ditampilkan dengan alasan Needs detail / Different scope / Outside requested time. Jangan memenangkan harga rendah karena biaya wajib belum disebut.

Primary price: **Quoted total for the agreed scope**. Tampilkan rincian dasar, transport, termasuk, opsional, unknown, jadwal dan garansi berdampingan. Deck boleh ada, dengan tabel Compare sebagai akses langsung.

Skor pilihan dapat memakai prioritas harga/jadwal/kepercayaan, dengan parts dan bobot terlihat. Komponen harga menggunakan total yang benar-benar dikutip untuk scope sebanding. Rating demo diberi label; kelengkapan biaya menjadi syarat perbandingan, bukan cara menyamarkan biaya kosong sebagai diskon.

Preset Cheapest / Earliest / Most trusted hanya mengurutkan quote yang sebanding. Peringkat bukan sertifikasi kualitas teknisi atau harga pasar.

### 7.2 Aksi agen pembeli

Allowed actions dihitung server: ask_detail, counter, counter_terms, close. Model memilih aksi terstruktur dan alasan singkat; server merender pesan dari fakta terverifikasi. Tidak meminta atau menampilkan chain of thought.

- ask_detail: meminta field yang kurang, maksimal tiga klarifikasi otomatis per cabang.
- counter: satu tawaran nominal per cabang, memakai target yang diizinkan atau total pesaing yang benar-benar dikutip untuk scope sama.
- counter_terms: satu permintaan syarat, misalnya transport atau garansi; hasil baru berlaku setelah provider mengonfirmasi.
- close: berhenti otomatis; kanal manusia tetap terbuka.

Nominal pesaing hanya dikutip tanpa nama dan jika sumber/revision masih relevan. Perkiraan tambahan dan harga pasar bukan penawaran pesaing. Jangan menyebut suatu total all-in untuk kerusakan yang belum didiagnosis.

Setiap pesan keluar melalui validasi aksi, sumber, nominal dan kerahasiaan. Instruksi di pesan provider diperlakukan sebagai data. Model gagal/timeout/schema tidak valid → rules atau klarifikasi, dengan label engine dan alasan.

Maksimal satu task per cabang; cabang dapat berjalan paralel. Task, lease, deadline dan generation disimpan persisten; proses melalui request mutasi terautentikasi atau worker, bukan timer/lock dalam satu proses. GET polling tidak menjalankan agen. Timeout model default 8 detik, tanpa retry otomatis. Batas konkurensi/rate limit dikonfigurasi. Budget dan error privat tidak bocor melalui konteks model.

Provider dapat bertanya balik. Jawab hanya fakta job; merek/diagnosis yang belum ada diteruskan ke konsumen. Takeover menghentikan agen dan timer ronde sampai diserahkan kembali. Finish now menilai hasil yang tersedia tanpa mengarang quote.

## 8. Estimasi dan referensi harga

Estimasi biaya opsional hanya informasi terpisah berlabel **Planning estimate — not an agreed charge**. Likelihood harus memiliki sumber yang memadai; tanpa itu tampilkan skenario kondisional dari harga yang dikutip, tanpa probabilitas buatan.

Estimasi tidak menentukan booking masuk budget, tidak menjadi angka counter, tidak masuk committed_total dan tidak ditagihkan.

Referensi harga harus menunjukkan item, satuan, scope, sumber, tanggal dan kecukupan data. Data tipis ditandai Insufficient data. Perbedaan terhadap referensi tidak otomatis berarti fraud, harga umpan atau kewajiban memakai harga pengganti.

Tidak ada kartu merah hanya karena harga dasar rendah atau tambahan belum diketahui. Kartu menjelaskan keadaan yang dapat dibuktikan: Missing detail, Already included, Price changed, New work needs approval, Instruction ignored.

## 9. Persetujuan dan versi

Memilih quote mensyaratkan branch, revision terkini, scope sebanding dan budget yang cukup. Pilihan membuat versi 1 draft, bukan booking aktif.

Terms memuat scope, lokasi umum, jadwal, lines, committed_total, spending_limit privat dan alasan perubahan. fixed pada quote menjadi committed; included/optional/unknown tetap berbeda.

committed_total hanya menjumlah committed. Terms immutable sejak dibuat; koreksi dilakukan dengan menolak proposal lalu membuat versi baru. Versi sebelumnya dan penerimaannya tidak ditimpa.

Submit mengubah draft menjadi pending. Kedua pihak menerima version_id dan terms_digest yang sama. Konsumen mengirim budget_ack_limit tepat sesuai spending_limit; provider mengirim null dan tidak melihat limit.

Digest SHA-256 berasal dari public_terms tanpa spending_limit, JSON UTF-8 dengan key objek diurutkan rekursif dan array dipertahankan. Digest memeriksa konsistensi; tidak mengklaim identitas terverifikasi.

Aktivasi dilakukan atomik: verifikasi ownership, digest, parent/expected active, penerimaan unik per role; setelah kedua pihak menerima, supersede active lama, aktifkan versi baru dan kosongkan pending pointer. Replay identik idempoten. Klik ganda/race tidak membuat dua versi aktif. Rejected proposal tidak menonaktifkan active lama.

## 10. Cek tagihan dan perubahan di lokasi

Input item, unit, quantity, harga dan penjelasan; foto tagihan hanya membantu pengisian. Pengguna memeriksa hasil baca model sebelum dinilai.

| Status | Arti | Tindakan |
|---|---|---|
| matches | Scope, jumlah, satuan dan harga sesuai | Tampilkan versi/sumber |
| already_included | Item termasuk ditagihkan lagi | Minta koreksi dengan sumber |
| price_changed | Harga item committed meningkat | Perlu proposal dan dua penerimaan |
| new_work | Pekerjaan baru belum committed | Minta rincian dan persetujuan |
| needs_clarification | Item/satuan/jumlah/diagnosis belum setara | Minta penjelasan, tanpa tuduhan |

Quantity baris item/unit yang sama dijumlah sebelum dibandingkan. Split baris tidak dapat melewati jumlah yang disepakati. Total baris yang diperiksa bukan otomatis total tagihan tambahan.

Cek tidak mengubah terms, tidak membayar, tidak menyetujui pekerjaan dan tidak mengganti harga provider dengan buku harga.

Provider mengirim rincian tambahan melalui chat: item, harga, satuan, quantity dan alasan. Extractor membuat kandidat bersumber. Konsumen memilih kandidat; server memverifikasi sumber dan menyalin terms aktif ke draft perubahan.

Jika committed_total baru melebihi spending_limit, proposal ditolak kecuali konsumen mengajukan limit baru secara eksplisit. Limit baru tetap harus diakui saat menerima. Selama proposal pending, versi lama berlaku.

Perubahan dapat menambah pekerjaan atau merevisi harga/jumlah secara eksplisit. Perubahan item termasuk menjadi berbayar wajib menunjukkan perubahan scope; item termasuk dengan scope sama tidak dapat ditagihkan ulang. Tidak ada perubahan diam-diam melalui update quote.

## 11. Penyedia, pembayaran simulasi dan penyelesaian

Provider memiliki inbox/chat, profil usaha, consent, area/jam, price list dan hasil penilaian atas penawarannya sendiri. Tidak menerima nama konsumen, budget/limit, acceptance actor ID konsumen, quote pesaing atau event internal.

Price list adalah harga provider, bukan sumber patokan pasar. Perubahan price list tidak mengubah versi aktif.

Ledger pembayaran simulasi memakai hold, topup, release, refund, dengan referensi deal dan versi. Dana yang disetujui berbeda dari dana yang sudah dibayar. Aktivasi versi baru yang menaikkan total menampilkan tambahan pembayaran yang masih perlu dilakukan.

Provider menandai selesai; konsumen mengonfirmasi. Auto-release simulasi setelah 72 jam hanya untuk pekerjaan selesai, tanpa sengketa atau perubahan yang belum selesai. Nominal dan replay dihitung server, tidak digandakan karena klik ulang.

Sengketa membawa versi, pesan dan bukti. Rekomendasi refund/rework/release dijelaskan sebagai kebijakan simulasi dan memerlukan alur persetujuan yang sesuai. Tidak mengarang persentase refund atau mengklaim mediator operasional. Ulasan satu kali setelah penyelesaian, provider boleh membalas.

## 12. UI dan bahasa

Semua UI English. Input Indonesia, nama bisnis, tempat Jakarta dan Rupiah tetap dipertahankan. English clarification options dipetakan ke nilai kanonik; parser tidak bergantung pada teks tombol.

Layar: sign-in/profile; request; scoreboard/negotiation room; Compare/deck; agreement/versions; ticket; on-site check/change; lifecycle; provider inbox/chat/jobs/profile/reviews; demo controls.

Brand indigo/coral, logo Wasit, kartu warna + ikon + teks, harga tabular, mobile 390 px, desktop comparison panels, default Light, pilihan dark mode dan reduced motion. Animasi harus membantu memahami perubahan; tidak menggantikan penjelasan.

Tiket menonjolkan **Agreed work**, **Agreed total**, **Not ordered**, **Both parties accepted**, dan **Version N**. Hash adalah detail. Pending menulis **Changes pending — Version N still applies**.

## 13. Keamanan dan kegagalan

- Cookie konsumen HttpOnly/SameSite, Secure pada HTTPS; mutasi memakai CSRF dan pemeriksaan Origin.
- Provider akun hanya cabang miliknya; tautan cabang memakai secret acak minimal 32 byte, hash tersimpan, expiry/reset.
- Secret tautan ada di fragment → memori → Authorization Bearer; hapus fragment. Tidak di query, localStorage, log atau snapshot umum.
- Proyeksi provider adalah allowlist server, bukan menyembunyikan field di FE.
- Ownership request/deal/version/branch diperiksa sebagai relasi, bukan ID terpisah.
- Tanpa sesi 401, salah wewenang 403, milik konsumen lain 404, stale/race 409, budget/source tidak valid 422.
- client_message_id unik per cabang: replay teks sama mengembalikan pesan semula; teks berbeda ditolak.
- Reset hanya resource sesi pemilik, merotasi token dan membatalkan task generation. Hasil async terlambat tidak boleh menulis.
- Restart tidak mengirim negosiasi ulang otomatis. Persetujuan tersimpan persisten.
- Penyedia simulasi selalu berlabel. Tidak ada klaim keselamatan atau akurasi umum dari beberapa contoh uji.

## 14. Arsitektur dan status dokumen

Satu aplikasi React dan API Node pada Vercel. Produksi memakai database transaksional eksternal; SQLite lokal hanya untuk development dan pengujian invariant. Modul: katalog, uang/waktu, formatter, extraction/provenance, comparison/ranking, buyer policy, provider simulator, versioned agreements, bill check, lifecycle, auth/projection, events dan model adapter.

Data utama: sessions, profiles, providers, provider_prices, requests, branches, messages, quote revisions, deals, agreement versions, acceptances, bill checks, payment ledger, disputes, reviews, events dan settings.

Contract target memisahkan job publik/privat, quote, comparison, version, public_terms, acceptance, consumer snapshot dan provider snapshot. Waktu runtime epoch ms atau ISO UTC hanya sesuai field yang ditetapkan kontrak; label jadwal WIB. ID dibuat server; machine enums konsisten lintas modul.

PRD menetapkan perilaku produk. Schema, tipe, fixture dan tiket implementasi harus selaras sebelum fitur diklaim selesai. Fondasi yang tersedia tidak berarti seluruh fitur di dokumen sudah dibangun.

## 15. Strategi build dengan Codex

Dua builder bertindak sebagai pemilik keputusan dan integrasi, masing-masing dibantu Codex untuk pekerjaan modul. Scope tidak dipotong hanya berdasarkan estimasi jam manusia.

Workflow yang diadopsi: tugas terdefinisi → implementasi → jalankan pemeriksaan → amati hasil → perbaiki → catat status. Konteks dan acceptance criteria dipertahankan selama pekerjaan. Pola tersebut sejalan dengan [official OpenAI guidance on long-running Codex work](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex).

| Pemilik | Tanggung jawab | Pekerjaan agent yang dapat dipisah |
|---|---|---|
| A | Domain, kontrak, DB, API, uang, ranking dan transaksi | Extraction validation, comparison, agreement/bill-check, akses dan tes state |
| B | UX, client, model adapter, integrasi UI dan demo | Komponen/layout, negotiation room, agreement views, provider UI, model eval |

Setiap tugas Codex memiliki tujuan, kontrak input/output, file milik tugas, acceptance criteria dan perintah verifikasi. Modul independen boleh dikerjakan paralel pada branch/worktree terpisah; schema dan file integrasi mempunyai satu pemilik. Agent tidak mengubah kontrak sepihak.

Codex dipakai untuk implementasi, fixture relevan, reproduksi bug, pengujian aturan uang/akses/state, review perubahan dan perbaikan. Agent reviewer memeriksa invariant produk, bukan sekadar format. Review tambahan tetap didampingi tes dan keputusan manusia; [official OpenAI guidance on code review](https://developers.openai.com/blog/custom-code-review-rules-for-codex) menegaskan review agent tidak menggantikan pemeriksaan yang menegakkan aturan.

Gate integrasi: chat manusia → quote bersumber → perbandingan/negosiasi → versi 1 → perubahan versi 2 → lifecycle dan kategori tambahan. Tiap gate menunjukkan hasil berjalan, bukan hanya file atau jumlah agent.

Bukti build mencatat ticket/task, tanggal run, perubahan/commit, pemeriksaan, kegagalan, perbaikan dan review manusia. Tampilkan dua atau tiga contoh kerja Codex yang benar-benar terjadi, termasuk bug yang diperbaiki. Jangan mengarang persentase kontribusi, hasil run, screenshot atau riwayat commit.

Runtime AI Wasit dan Codex untuk membangun aplikasi adalah dua hal berbeda. Demo menjelaskan keduanya secara tepat.

## 16. Evaluasi dan definisi selesai

### Kasus kritis

1. Harga dasar eksplisit, transport kosong → needs_detail, bukan Rp0.
2. Transport gratis eksplisit → included nol bersumber.
3. Dua item/harga dalam satu pesan tidak tertukar.
4. Scope/unit/jumlah berbeda tidak mendapat ranking seolah setara.
5. Counter hanya mengutip target yang diizinkan atau quote pesaing setara.
6. Budget dan nama tidak bocor ke provider/model buyer.
7. Estimate tidak masuk committed_total atau pembayaran.
8. Quote revision lama tidak bisa dipilih.
9. Dua penerimaan mengaktifkan tepat satu versi; replay idempoten.
10. Proposal pending/rejected mempertahankan active lama.
11. Item termasuk ditagihkan ulang terdeteksi.
12. Split quantity, harga naik dan item baru dipisahkan.
13. Tambahan melewati limit ditolak sampai limit baru diusulkan dan diakui.
14. Model timeout/injection/source salah memakai fallback yang terlihat.
15. Reset membatalkan task/token lama tanpa menyentuh sesi lain.
16. Ledger simulasi tidak menggandakan hold/topup/refund.
17. Setiap kategori yang ditawarkan memiliki alur dan satuan yang diuji.
18. English UI dan klarifikasi round-trip bekerja dengan input Indonesia.

Reviewer selain penulis parser menyiapkan pesan baru dan expected label sebelum run. Bandingkan rules/model pada pesan yang sama: item, harga, kind, unit, source, tindakan, fallback dan durasi aktual. Hasil kecil dilaporkan dengan ukuran sampel.

Selesai jika input manusia baru berjalan dari permintaan sampai perbandingan, negosiasi, agreement dan perubahan biaya tanpa edit seed; invariant akses/uang/versi lulus; UI memperlihatkan alasan; bukti Codex dan run aktual tersedia.

## 17. Cerita demo

Angka berikut sintetis [A], bukan harga pasar.

1. Konsumen meminta servis AC dengan budget privat Rp250.000.
2. Tiga provider menawarkan scope sama: A Rp110.000 lengkap; B Rp95.000 tetapi transport belum diketahui; C Rp130.000 lengkap dengan jadwal berbeda.
3. Agen menanyakan transport B; setelah menjadi Rp125.000, A dan B dapat dibandingkan pada group yang sama.
4. Agen menawar B dengan total A Rp110.000 yang benar-benar dikutip; B menjawab final Rp105.000 untuk scope setara.
5. Konsumen memilih A karena jadwal yang lebih sesuai; ranking dan alasan menunjukkan trade-off, bukan selalu termurah.
6. Kedua pihak menerima versi 1 Rp110.000, cek freon termasuk.
7. Cek freon ditagihkan Rp25.000 → Already included, dengan sumber.
8. Provider mengusulkan kapasitor 1 pcs Rp150.000. Total Rp260.000 melewati limit Rp250.000.
9. Konsumen mengusulkan limit Rp260.000; kedua pihak menerima versi 2. Versi 1 tetap berlaku sebelum aktivasi.
10. Tunjukkan hasil uji aktual dan contoh Codex memperbaiki satu bug persetujuan/provenance.

Demo utama menghubungkan pilihan sebelum booking dengan perubahan di lokasi. Kategori lain, foto tagihan dan pembayaran simulasi dapat diperlihatkan sebagai bukti kedalaman yang sudah berjalan, tanpa memutus cerita utama.

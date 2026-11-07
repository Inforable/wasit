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

Brand: **Wasit**. Tagline: **Better deals from local pros. No surprise extras.**

Welcome copy (approved):

> WASIT · THE REFEREE FOR HOME SERVICES
>
> Better deals from local pros.
> No surprise extras.
>
> Tell Wasit what needs fixing. It asks several pros at once, gets the full price in writing, and haggles for you: free transport, bundle discounts, longer warranties. Nothing extra gets charged without your OK.

- Several pros, one request
- Haggles for more than just price
- No extra charge without your OK

The headline stays centered. Negotiated benefits are requests to providers; only explicitly confirmed terms enter an agreement.

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

Maksimal satu task per cabang; cabang dapat berjalan paralel. Task, lease, deadline dan generation disimpan persisten; proses melalui request mutasi terautentikasi atau worker, bukan timer/lock dalam satu proses. GET polling tidak menjalankan agen. Timeout model default 12 detik, dapat dikonfigurasi hingga maksimum 20 detik, tanpa retry otomatis. Batas konkurensi/rate limit dikonfigurasi. Budget dan error privat tidak bocor melalui konteks model.

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

Alur utama: welcome tanpa navigasi aplikasi, profil/prioritas, lalu ruang aplikasi dengan composer permintaan. Header aplikasi menyediakan history, status agen dan pengaturan. Permintaan bergerak ke proses penawaran, perbandingan, kesepakatan dan pemeriksaan perubahan. History membuka kembali permintaan atau kesepakatan milik pengguna. Halaman penyedia berdiri sendiri tanpa navigasi konsumen. Transisi fase, peluncuran agen, drawer dan sheet mengikuti aturan motion serta reduced motion yang sama.

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


## 17. Implementation and verification evidence

These records describe actual implementation and test runs. Hosted availability remains a separate deployment gate.


### 17.1 Agent evaluation

Evaluation recorded on 7 November 2026. Offline checks make no API calls. An authorized live trial subsequently made **30 OpenAI calls**, using GPT-6 Luna for text roles and GPT-6.1 Terra for image/support roles. No other model provider was used. Real bill OCR accuracy remains unmeasured.

#### Actual extraction results

Twenty hand-written messages cover all five service categories, explicit prices, included costs, optional work, missing costs, conflicting prices, units, schedule denial, cross-item price borrowing and prompt injection. Expected facts were written separately from extractor output and were never supplied as model prompt examples.

| Measurement | Initial independent run, 12:34 WIB | Regression run after two fixes, 12:44 WIB |
|---|---:|---:|
| Exact cases | 16/20 (80%) | 18/20 (90%) |
| Accepted-line precision | 92.86% | 100% |
| Expected-line recall | 81.25% | 87.5% |
| Median extraction time | 0.801 ms | 1.189 ms |
| p95 extraction time | 2.225 ms | 3.358 ms |
| Live model calls | 0 | 0 |

These timings measure local parsing and source validation on this machine. They do not include HTTP, database, network or model latency.

The initial failures were a missing pipe-repair alias, an instruction using ?all previous instructions,? and two washing-machine examples using an unsupported service unit. The first two issues were corrected. Once those examples informed changes, the second run became a regression result; it is not a fresh independent validation score.

Two labels remain unmet. ?Washing machine service: 1 service at Rp167.000 per service? and the corresponding unknown-price example use `service`, while the catalog requires `unit`. The system discards the unsupported unit rather than silently treating units as equivalent. The labels remain unchanged, so this coverage limit stays visible in both the detailed output and the exit status.

#### Reproduce

Run `node scripts/eval-agents.mjs` from the application directory. It prints every expected fact, actual fact, source rejection, failure, engine and timing as JSON. It exits with status 1 while any exact-case label is unmet. The remaining two unit-coverage failures are expected and documented.

Run `node scripts/eval-agents.mjs --live` only when a live evaluation is intended and an API key and extractor model are configured. The output separates effective model results from rules fallbacks and records rejected responses. Without credentials, the model baseline is explicitly `not_run`.

The suite is a small synthetic sample. A new, untouched labeled set is needed before claiming broader Indonesian/English language coverage. Mocked image requests are excluded from OCR quality measurements.

#### Actual OpenAI trial

The first live batch ran from 12:54:45 to 12:55:37 WIB and made 27 calls. All returned HTTP 200 with completed responses. It used 13,319 input tokens and 2,316 output tokens, as reported by the API. The existing twenty extraction labels were kept unchanged.

| Initial live extraction measurement | Observed result |
|---|---:|
| Exact cases after validation and fallback | 16/20 (80%) |
| Accepted-line precision | 92.86% |
| Expected-line recall | 81.25% |
| Rules fallbacks | 5/20 |
| Median end-to-end extraction time | 1,633.236 ms |
| p95 end-to-end extraction time | 4,441.266 ms |

This live run performed worse than the rules regression baseline. Five model results required schema/source fallback. Two unsupported washing-machine-unit labels remained unmet. The model also omitted an unresolved transport item and extracted a price from an instruction by selecting a snippet that excluded the instruction prefix.

The full-message instruction check now runs before the model call and again at the server source-validation boundary. A model cannot discard an explicit unknown charge or turn a source-verified price into an unknown value. These cases use rules fallback rather than accepting the incomplete model result.

A focused rerun used two additional calls: unresolved transport passed through rules fallback, the instruction was blocked before any network call, and a cross-item example exposed a further conservative loss of an explicit optional price. After that guard was strengthened, one final call verified the cross-item example through rules fallback. These selected reruns are regression evidence; a complete twenty-case live score after the final fixes was not measured.

| Other live check | Observed behavior |
|---|---|
| Buyer with authorized target | Model selected a valid counter at Rp105,000; the server rendered the message. |
| Buyer with missing transport | Model selected a permitted transport clarification. |
| Provider RFQ | Model selected a verified price-list phrasing. |
| Provider counter | Model used its own permitted Rp95,000 service offer. |
| Formatter with approximate target | Kept the maximum-budget question and reported rules engine. |
| Card explanation | Model selected a computed, approved sentence. |
| Synthetic bill image | Read all three independently printed item/unit/quantity/price rows correctly; confirmation remained required. |
| Forced timeout | A simulated failed transport returned a rules fallback; this check made no paid call. |

The bill fixture was rendered in an isolated headless browser. Its printed rows were AC cleaning, 1 unit at Rp113,000; transport, 1 job at Rp13,000; and refrigerant check, 1 service at Rp0. One clear synthetic image is not evidence of real-world bill OCR accuracy.

Across the initial batch and focused reruns, **30 actual calls** used **14,915 input tokens and 2,927 output tokens**, totaling **17,842 tokens**. All actual API requests completed with HTTP 200. Monetary cost is not inferred from these counts; actual billing remains available in the OpenAI account.

Run `node --env-file=.env scripts/eval-live-agents.mjs --live` for an explicitly authorized batch capped at thirty calls. Focused regressions use `--live --focused`, with optional `--case=cross-item-price`. The runner records sanitized status, latency, usage and model output in ignored results files. It never prints authorization headers or the API key. The initial live trace and the subsequent focused traces remain separate.

#### Runtime roles and boundaries

| Role | Model input and permitted result | Failure behavior |
|---|---|---|
| Formatter | Explicit request text, supplied fields and answers; suggested fields must be independently supported by user text. | Keep rules output and ask for missing facts. A target never becomes a spending cap. |
| Extractor | Public job, this provider message, catalog and prior quote. Atomic item, quantity, unit, price and exact source checks run afterward. | Reject unverifiable facts and use source-checked rules. |
| Buyer | Code-computed allowed actions, available citations and own source IDs. | Validated rules action; outgoing text is rendered by the server. |
| Provider simulation | Its own price list and floor, public job and approved messages. Consumer limits and other branches are omitted. | Use the deterministic script. A model may choose only a verified phrasing. |
| Card explanation | Computed, approved sentences about the quotation. | Keep the server explanation if new wording introduces an unsupported claim. |
| Bill reader | A supported bill image. Only complete visible lines may be returned. | Return an explicit unavailable error or an empty editable preview. Customer confirmation is required before checking the bill. |

Provider simulation is visibly identified by its actual engine. Model output cannot accept an agreement, authorize extra work, transfer payment or alter a locked agreement. Bill reading never submits a bill automatically.

#### Model transport and concurrency

Set `OPENAI_API_KEY` and `OPENAI_MODEL`, or configure `OPENAI_MODEL_BUYER`, `OPENAI_MODEL_EXTRACTOR`, `OPENAI_MODEL_PROVIDER`, `OPENAI_MODEL_FORMATTER` and `OPENAI_MODEL_SUPPORT` individually. No model name is silently selected.

For an initial live trial, `OPENAI_MODEL=gpt-6-luna` fits bounded text roles and `OPENAI_MODEL_SUPPORT=gpt-6.1-terra` targets bill-image interpretation. This is a workload-based recommendation from their documented capabilities, not a measured quality result. Both support image input, structured outputs and `reasoning.effort=none`; `OPENAI_REASONING_EFFORT=none` can be configured for the eight-second path. Account access and real latency must still be verified. See the official [GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) and [GPT-6.1 Terra model page](https://developers.openai.com/api/docs/models/gpt-6.1-terra).

The Responses request uses `text.format` with strict JSON Schema. Local schema references are expanded before the request; the full local schema validates the returned object, including conditions omitted from the supported wire subset. Refusals, incomplete responses, malformed JSON, extra fields and transport failures are rejected. The recorded trial used an eight-second maximum. The current runtime defaults to 12 seconds, capped at 20 seconds through OPENAI_TIMEOUT_MS, with no automatic retries and `store: false`. This implementation follows the official [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Vision sends a bounded image as an `input_image` data URL, following the official [image input documentation](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses). Image signature and declared format must agree. Mocked tests verify transport and confirmation behavior; they do not establish image-reading quality.

A persisted settings-row lock limits model calls to two across runtime instances sharing the same database. Leases expire two seconds after the configured model deadline; the recorded trial used ten-second leases with eight-second calls. Rules are used when the cap is occupied. Request tasks independently enforce two simultaneous processing claims and one claim per branch. Lease and request generation are checked before domain writes; a reset or expired claim discards late results.

#### Verification and remaining limits

Twenty adapter/evaluation/telemetry tests and nine request orchestration integration tests pass. They exercise timeouts, refusal/schema rejection, privacy, source-price rejection, unavailable vision, confirmation-only bill previews, persisted model leases across runtime instances, full-message instruction rejection, lost-price/unknown-item fallback, live-call caps, secret redaction, real SQLite task state, reset races, human messages, ownership, takeover, finish and optional model simulation.

The PostgreSQL adapter pins a client from BEGIN through COMMIT/ROLLBACK. No-op updates of the shared settings rows provide the cross-instance serialization needed by task and model claims at the default isolation level. Network and injected loaders run outside transactions. SQLite tests verify the same store contract; they do not establish production database latency or a live PostgreSQL race result.

The concurrency guarantee requires every instance to share the same persistent database. Expired provider-side API work may continue if a network service ignores cancellation, but its response is not applied after the local deadline. The live trial establishes only the observed behavior above; broader quality and real bill performance need larger independent evaluation sets.


### 17.2 Consumer frontend verification

Verified locally on 7 November 2026 with the integrated HTTP application, an isolated SQLite smoke database, and installed Google Chrome controlled through Playwright. The screenshots and JSON report are local artifacts under `results/consumer/` and are not production data.

#### Implemented behavior

The welcome headline is centered and reads **Better deals from local pros. No surprise extras.** Light is the initial theme. The request form supports all five service categories, location, WIB schedule, a private spending cap, a separately authorized negotiation target, and visible preference weights. Draft input survives navigation within the current browser session.

English clarification answers produce a new child request without overwriting the original. The live room processes persisted work through authenticated POST requests and polls GET snapshots. Polling stops when unmounted. Customer takeover pauses agent chat; stable message identifiers protect retries. The customer can explicitly hand control back to Wasit.

Comparison follows server-defined equivalent-scope groups and exclusions. Required unknown costs remain unknown. Price sources, preference weights, scoring parts, engine labels, and concise activity summaries are visible. Choosing an offer opens agreement review without accepting it.

Optional-work planning displays each optional item as a separate scenario. Its additional amount and resulting planning total never become an approval or agreed charge. Unknown provider prices and missing independent reference information are stated explicitly.

Demo scenarios are labeled synthetic. Reset requires an explicit confirmation. Presentation view uses the browser fullscreen API with capability checks and an explicit exit control; simulation labels remain visible.

#### Verification results

- Production build passed with all integrated consumer, agreement, and provider modules.
- The assigned formatter/catalog and provider/directory/communications suites passed 20 tests, including ownership, privacy, idempotency, stale generations, task leases, and five-category source extraction.
- `node scripts/smoke-consumer.mjs` passed **17 real-browser checks** against `http://127.0.0.1:3311`.
- Browser checks cover request creation, English clarification and child navigation, task processing into comparison, source expansion, excluded offers, advisory planning, keyboard tabs, takeover/send/handback, and agreement navigation.
- Mobile checks at 390 by 844 verify draft preservation, request and comparison overflow, and visible request controls with at least 44px touch targets.
- The initial Light theme was checked while the browser requested a dark operating-system preference.
- Supported presentation view entered and exited successfully. No browser runtime errors occurred.

#### Visual evidence

`results/consumer/welcome-desktop.png`, `welcome-mobile-after.png`, `compare-desktop.png`, `request-mobile.png`, and `compare-mobile.png` record the checked layouts. The centered mobile welcome and mobile form/comparison screenshots were visually inspected. `report.json` records the complete browser-check list.

#### Remaining boundaries

The browser run uses the local transactional store and real application routes. It does not establish production database availability, public deployment access, real provider supply, real payments, market-price accuracy, or exhaustive assistive-technology compatibility. Independent reference-price collection remains separate work. Customer/provider role actions and agreement lifecycle have their own verification.


### 17.3 Agreement and provider verification

Verified on 7 November 2026 in a real, headless Chrome browser at 390 × 844 pixels. The browser used the local application at `http://127.0.0.1:3311`, an isolated SQLite database, separate customer and provider browser contexts, and labeled demo business data. These results do not establish production database readiness or real payment processing.

`node scripts/smoke-agreements.mjs` passed 13 checkpoints:

1. A provider invitation removes its bearer token from the URL fragment and keeps it out of localStorage.
2. A deliberately lost response is retried with the same client message ID; the server stores exactly one message.
3. The provider sends a complete, source-backed quote through the live inbox.
4. Customer acceptance alone does not activate an agreement.
5. Independent provider acceptance activates version 1. The provider response and rendered interface omit private limits and customer identifiers.
6. The customer explicitly simulates payment for the committed amount.
7. A provider-sourced change creates version 2 while version 1 remains active. Both parties accept the new version; its additional amount remains due until a separate top-up.
8. Manually entered bill lines require confirmation and return a check against active version 2.
9. Provider completion, customer release, a one-time review and a provider reply work through their respective principals.
10. The provider loads and saves its business profile and price list, and reads its own reviews and quote-quality feedback.
11. Agreement and provider feedback screens have no horizontal overflow at 390 pixels.
12. A customer opens a dispute and adds evidence. The provider accepts rework; funds remain held, no refund is invented, and a new completion is required.
13. No browser runtime exceptions are recorded.

The production frontend build also passes. The reference-data, comparison/buyer and lifecycle regression suites passed 40 tests including subtests. The browser script writes a JSON report and screenshots for the agreement, provider feedback and accepted rework. Screenshots were opened for visual inspection: existing colors, typography, spacing, radii and components remain consistent; payment and dispute simulations are visibly labeled.

To repeat the browser check, run a local application with its matching allowed origin and isolated test storage, build the frontend, then run the script. `SMOKE_BASE_URL`, `SMOKE_OUTPUT` and `CHROME_PATH` can override the local URL, artifact directory and Chrome executable. The script creates new demo requests in its own customer session. It does not reset another session or use a production account.

Live image reading was not exercised with a configured model in this browser run. The photo surface leaves extracted items editable and requires confirmation; manual entry remains available when image reading is unavailable. Hosted PostgreSQL behavior, hosted model credentials and the production deployment need their separate environment checks before being described as ready.


### 17.4 Published reference-price evidence

Collected on **7 November 2026** from primary service-provider or marketplace pages. The survey contains **13 published item observations across five categories**, organized into nine distinct scopes. Eight other candidates were excluded before aggregation. No phone enquiry, booking, payment or provider message was fabricated or sent.

These are published advisory observations, not completed transaction prices or accepted quotes. The collection date does not establish when a publisher last updated its price. Pages without an effective date retain that uncertainty; the separate Ataya table explicitly carries a 2024 heading.

#### AC cleaning: one narrowly defined sample

The comparable group covers the **published cleaning item for one standard, non-inverter split AC of 0.5–1 PK at an ordinary residential property**. It covers routine indoor/outdoor cleaning. It does not establish the final invoice, transport, refrigerant, repairs, overhaul or an apartment surcharge. Its machine scope is `split_ac_standard_0_5_1pk_cleaning_base_item_residential`.

| Publisher and primary page | Observed item price | Relevant conditions |
|---|---:|---|
| [Denan Teknik](https://denanteknik.com/) | Rp75,000/unit | The page separately lists a Rp75,000 minimum and Rp25,000 apartment surcharge. |
| [Mandiri Jaya Servis](https://www.mandirijayaservis.com/service-ac-jakarta-pusat) | Rp75,000/unit | Indoor/outdoor cleaning is described; apartment surcharge and minimum are separate. |
| [Riki Jaya Tehnik](https://www.rikijayatehnik.com/) | Rp75,000/unit | Capacity, unit and cleaning components are explicit. Direct HTTPS retrieval returned 200. |
| [SEJUK-AC](https://sejuk-ac.com/) | Rp75,000/unit | This is the displayed discounted item rate. The crossed-out Rp105,000 is not another sample. Direct HTTPS retrieval returned 200. |
| [Dokter-AC](https://dokter-ac.com/service-ac/jakarta-pusat) | Rp75,000/unit | The page distinguishes apartment/commercial surcharges and canceled-visit charges. |

There is one observation per separately named business and primary domain, with distinct published business contact identities. Regional aliases and duplicate price cards were not counted again. Ultimate corporate ownership and copied-catalog relationships were not independently audited; this convenience sample must not be described as a representative market survey or five verified completed transactions.

For these **five observations from five named publishers**, nearest-rank **p25 = Rp75,000 and p75 = Rp75,000**. The identical values describe this small collected sample; they do not establish that every valid provider should charge Rp75,000. The group is separate from a full cleaning-and-inspection agreement, whose required costs and scope may differ.

An additional [Ataya Agung Pratama](https://atayaagungpratama.com/) split-wall cleaning item is Rp100,000/unit. Its capacity is unspecified, so it remains in a separate group with `insufficient_data` and no percentiles.

#### Other categories: preserve the differences

| Category | Collected observation | Primary source and scope |
|---|---|---|
| Washer | Rp150,000 for the top-loading minor-service item | [Sejasa washer service](https://www.sejasa.com/layanan/service-mesin-cuci). Labor item for minor work; parts and possible application/apartment charges are separate. This is not an unlimited repair price. |
| Washer | Rp75,000 per visit/inspection service | [Sejasa washer service](https://www.sejasa.com/layanan/service-mesin-cuci). Inspection-only fee; waived when other service proceeds. Kept separate from repair. |
| Cleaning | Rp140,000 for one two-hour package with tools and one worker | [Sejasa daily cleaning](https://www.sejasa.com/layanan/daily-cleaning). Stored as one package, never divided into a fictional standalone hourly rate. |
| Cleaning | Rp60,000/hour, minimum two hours | [CleanSheet / Cita Indonesia Bersih](https://citaindonesiabersih.com/services/daily-cleaning-cleansheet-jasa-cleaning-service/). Application-user promotion, maximum stated area 40 m²; separate from a whole-house job or package. |
| Electrical | Rp100,000 for one installation inspection service | [temanjasa electrical service](https://temanjasa.com/layanan/tukang-listrik). Inspection-only fee waived if repair proceeds; visit included, Rp5,000 application fee additional, materials excluded. |
| Electrical | Rp125,000 labor to replace one MCB | [temanjasa electrical service](https://temanjasa.com/layanan/tukang-listrik). `pcs` denotes the one discrete MCB in the published per-unit item; hardware is excluded. This is not a whole-installation repair. |
| Plumbing | Rp95,000 for one pipe/drain inspection service | [temanjasa plumbing service](https://temanjasa.com/layanan/tukang-ledeng). Inspection-only fee waived if repair proceeds; visit included, Rp5,000 application fee additional. A complete leak repair is not priced by this item. |

Every group in this table has **one observation from one publisher**. All remain `insufficient_data`; p25 and p75 are null. Published visits/assessments use the canonical `service` unit for that one assessment. Hourly work, two-hour packages, inspection and repair stay separate. No representative base-repair band was established for electrical or plumbing work.

#### Exclusions and ambiguity

The survey's `excluded_candidates` audit records the source and reason for each omitted candidate:

- [Pinhome AC](https://www.pinhome.id/pinhome-home-service/service-cuci-ac), [Home Steril washer service](https://home-steril.com/services/jasa-service-mesin-cuci-top-loading) and [MekanikListrik](https://mekaniklistrik.com/jasa-tukang-listrik-depok-profesional-bergaransi/) publish starting prices rather than fixed complete scopes.
- [Cool Pro](https://coolpro-ac.com/) qualifies its listed cleaning amount as a starting price. [Tunggal Jaya Teknik](https://tunggaljayateknik.com/) explicitly qualifies estimates by site conditions. Neither supplies an extra fixed sample here.
- [Bintang Service](https://bintangservice.com/daftar-harga-service-ac-jakarta/) showed differing search-summary/opened-page amounts and describes estimates. No arbitrary amount was selected.
- [Sejasa daily cleaning](https://www.sejasa.com/layanan/daily-cleaning) repeats the one-hour-with-tools label at two different amounts. That SKU is excluded; its unambiguous two-hour package is separate.
- [TukangLedeng.co.id](https://tukangledeng.co.id/harga-jasa-tukang-pipa-ahlihnya-tukang-pipa/) publishes a leak-repair range without a single fixed task/unit. Neither an endpoint nor a midpoint was invented.

The generated book counts the 13 admitted rows. The eight pre-aggregation exclusions are an additional audit list, not eight more price samples. Five categories being researched does not mean five categories have sufficient comparable evidence.

#### Artifact and usage checks

`data/reference-price-survey.json` passes the survey contract. `data/reference-price-book.json` was generated using `node scripts/build-price-book.mjs data/reference-price-survey.json data/reference-price-book.json`: 13 accepted observations, nine groups, one group meeting the minimum of five prices and three publishers. Its top-level `sufficient` value means at least one group is sufficient, not that every category is sufficient.

The advisory book must not change provider quotes, comparison ranking, private-budget eligibility, committed agreement totals or allowed counter citations. It supplies neither a fraud label nor a price guarantee. A future collection should create a new dated snapshot and output; the generator refuses to overwrite existing files.


### 17.5 Release integration checks

Renewed local Chrome checks passed: 27 consumer flows, 13 agreement/provider flows, eight navigation/theme checks, six provider-question checks, five modal/focus checks, six model-settings checks, four returning-session checks, two provider-photo checks and four explicit acceptance-to-active checks. These are separate suites with overlapping behavior, not independent quality samples.

A delayed-authentication probe kept the welcome usable while the session read was paused for five seconds. The welcome became visible in 849 ms. Initial JavaScript is approximately 385 KB, split from the earlier 506 KB. Fifteen seeded providers each have a distinct synthetic 384-pixel WebP photo, totaling approximately 341 KB. Images load lazily in provider contexts and do not load on Welcome; unknown providers retain initials.

The full five-category HTTP journey passes 60/60 stages and 260/260 stage checks. Separate live OpenAI AC journeys each complete 12/12 stages, including a capped run that continues through verified rules after transport failures. No perfect-model-quality claim is made.

Neon Free is provisioned and connected. Real PostgreSQL migrations and fresh pools pass; persisted revision caching reduces repeated cold migration work from approximately 6.5 seconds to approximately 0.2 seconds. A fresh public production AC journey passed 12/12 stages and 52 checks through 64 HTTPS requests, including persistent identity/profile/history, bilateral v1/v2, simulated funding, dispute/rework and release.

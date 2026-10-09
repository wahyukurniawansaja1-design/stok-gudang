const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

const SATUAN_UMUM = [
  "pcs", "unit", "buah", "set", "pasang", "lembar", "batang", "roll",
  "meter", "kg", "gram", "ton", "liter", "sak", "karung", "box",
  "dus", "pak", "botol", "kaleng",
];

let currentRole = null;
let allItems = [];

/* ---------- Bantuan ---------- */

function showView(name) {
  ["loading", "login", "main"].forEach((v) => {
    $("view-" + v).classList.toggle("hidden", v !== name);
  });
}

function showPage(name) {
  ["barang", "transaksi", "laporan"].forEach((p) => {
    $("page-" + p).classList.toggle("hidden", p !== name);
  });
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === name);
  });
  if (name === "transaksi") loadTransactions();
  if (name === "laporan") openLaporan();
}

// mencegah teks dari database dibaca sebagai kode HTML
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmt(n) {
  return Number(n).toLocaleString("id-ID");
}

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2500);
}

function statusOf(item) {
  const stok = Number(item.stok);
  if (stok <= 0) return "habis";
  if (stok <= Number(item.stok_minimum)) return "menipis";
  return "aman";
}

const BADGE = {
  aman: '<span class="badge ok">Aman</span>',
  menipis: '<span class="badge warn">Menipis</span>',
  habis: '<span class="badge out">Habis</span>',
};

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

/* ---------- Login / logout ---------- */

async function refresh() {
  const { data } = await sb.auth.getSession();
  const session = data.session;

  if (!session) {
    currentRole = null;
    showPage("barang");
    showView("login");
    return;
  }

  const { data: profil, error } = await sb
    .from("profiles")
    .select("nama, role")
    .eq("id", session.user.id)
    .single();

  currentRole = error ? "staf" : profil.role;
  const nama = (profil && profil.nama) || session.user.email;
  $("user-info").textContent = nama + " (" + currentRole + ")";
  $("add-btn").classList.toggle("hidden", currentRole !== "admin");

  showView("main");
  await loadItems();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  $("login-btn").disabled = true;
  $("login-btn").textContent = "Memproses...";

  const { error } = await sb.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value,
  });

  $("login-btn").disabled = false;
  $("login-btn").textContent = "Masuk";

  if (error) {
    $("login-error").textContent = error.message.includes("Invalid login credentials")
      ? "Email atau password salah."
      : "Gagal masuk: " + error.message;
  }
});

$("logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  $("password").value = "";
});

sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
    setTimeout(refresh, 0);
  }
});

/* ---------- Data barang ---------- */

async function loadItems() {
  $("barang-msg").textContent = "";
  const { data, error } = await sb.from("items").select("*").order("nama");
  if (error) {
    $("barang-msg").textContent = "Gagal memuat data: " + error.message;
    return;
  }
  allItems = data;
  renderSummary();
  fillKategori();
  renderItems();
  fillItemSelect();
}

function renderSummary() {
  $("sum-total").textContent = fmt(allItems.length);
  $("sum-menipis").textContent = fmt(allItems.filter((i) => statusOf(i) === "menipis").length);
  $("sum-habis").textContent = fmt(allItems.filter((i) => statusOf(i) === "habis").length);
}

function fillKategori() {
  const kats = [...new Set(
    allItems.map((i) => (i.kategori || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "id"));

  const sel = $("filter-kategori");
  const prev = sel.value;
  sel.innerHTML =
    '<option value="">Semua kategori</option>' +
    kats.map((k) => '<option value="' + esc(k) + '">' + esc(k) + "</option>").join("");
  if (kats.includes(prev)) sel.value = prev;

  $("kategori-list").innerHTML = kats
    .map((k) => '<option value="' + esc(k) + '"></option>')
    .join("");
}

function renderItems() {
  const isAdmin = currentRole === "admin";
  const q = $("search").value.trim().toLowerCase();
  const kat = $("filter-kategori").value;
  const st = $("filter-status").value;
  $("th-aksi").classList.toggle("hidden", !isAdmin);

  const rows = allItems.filter((i) => {
    if (q && !i.kode.toLowerCase().includes(q) && !i.nama.toLowerCase().includes(q)) return false;
    if (kat && (i.kategori || "").trim() !== kat) return false;
    if (st && statusOf(i) !== st) return false;
    return true;
  });

  if (rows.length === 0) {
    $("barang-body").innerHTML =
      '<tr><td colspan="8" class="empty">' +
      (allItems.length ? "Tidak ada barang yang cocok." : "Belum ada data barang.") +
      "</td></tr>";
    return;
  }

  $("barang-body").innerHTML = rows
    .map((i) => {
      const aksi = isAdmin
        ? '<td class="aksi">' +
          '<button class="btn-small secondary" data-act="edit" data-id="' + esc(i.id) + '">Edit</button> ' +
          '<button class="btn-small danger" data-act="hapus" data-id="' + esc(i.id) + '">Hapus</button>' +
          "</td>"
        : "";

      return (
        "<tr>" +
        "<td>" + esc(i.kode) + "</td>" +
        "<td>" + esc(i.nama) + "</td>" +
        "<td>" + esc(i.kategori) + "</td>" +
        '<td class="num">' + fmt(i.stok) + "</td>" +
        "<td>" + esc(i.satuan) + "</td>" +
        "<td>" + fmt(i.stok_minimum) + "</td>" +
        "<td>" + BADGE[statusOf(i)] + "</td>" +
        aksi +
        "</tr>"
      );
    })
    .join("");
}

$("search").addEventListener("input", renderItems);
$("filter-kategori").addEventListener("change", renderItems);
$("filter-status").addEventListener("change", renderItems);

// klik kartu ringkasan = filter cepat berdasarkan status
document.querySelectorAll(".stat").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("filter-status").value = btn.dataset.status;
    renderItems();
  });
});

$("barang-body").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const item = allItems.find((i) => i.id === btn.dataset.id);
  if (!item) return;
  if (btn.dataset.act === "edit") openForm(item);
  if (btn.dataset.act === "hapus") hapusBarang(item);
});

/* ---------- Form tambah / ubah barang ---------- */

// isi pilihan satuan
$("f-satuan").innerHTML =
  SATUAN_UMUM.map((s) => '<option value="' + s + '">' + s + "</option>").join("") +
  '<option value="__lain">Lainnya...</option>';

function currentSatuan() {
  const v = $("f-satuan").value;
  return v === "__lain" ? $("f-satuan-lain").value.trim() : v;
}

function updateSatuanUI() {
  const lain = $("f-satuan").value === "__lain";
  $("f-satuan-lain").classList.toggle("hidden", !lain);
  $("f-satuan-lain").required = lain;
  const s = currentSatuan() || "satuan";
  document.querySelectorAll("#barang-form .unit").forEach((el) => {
    el.textContent = s;
  });
}

$("f-satuan").addEventListener("change", updateSatuanUI);
$("f-satuan-lain").addEventListener("input", updateSatuanUI);

function openForm(item) {
  const isNew = !item;
  $("form-title").textContent = isNew ? "Tambah Barang" : "Ubah Barang";
  $("f-id").value = isNew ? "" : item.id;
  $("f-kode").value = isNew ? "" : item.kode;
  $("f-nama").value = isNew ? "" : item.nama;
  $("f-kategori").value = !isNew && item.kategori ? item.kategori : "";
  $("f-min").value = isNew ? 0 : item.stok_minimum;
  $("f-stok").value = "";

  if (isNew) {
    $("f-satuan").value = "pcs";
    $("f-satuan-lain").value = "";
  } else if (SATUAN_UMUM.includes(item.satuan)) {
    $("f-satuan").value = item.satuan;
    $("f-satuan-lain").value = "";
  } else {
    $("f-satuan").value = "__lain";
    $("f-satuan-lain").value = item.satuan;
  }

  $("f-stok-wrap").classList.toggle("hidden", !isNew);
  $("f-edit-note").classList.toggle("hidden", isNew);
  $("form-error").textContent = "";
  updateSatuanUI();
  $("barang-dialog").showModal();
}

$("add-btn").addEventListener("click", () => openForm(null));
$("cancel-btn").addEventListener("click", () => $("barang-dialog").close());

$("barang-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("f-id").value;
  const satuan = currentSatuan();
  const stokAwal = Number($("f-stok").value) || 0;

  if (!satuan) {
    $("form-error").textContent = "Satuan harus diisi.";
    return;
  }
  if (!id && stokAwal < 0) {
    $("form-error").textContent = "Stok awal tidak boleh negatif.";
    return;
  }

  const payload = {
    kode: $("f-kode").value.trim(),
    nama: $("f-nama").value.trim(),
    kategori: $("f-kategori").value.trim() || null,
    satuan: satuan,
    stok_minimum: Number($("f-min").value) || 0,
  };

  $("form-error").textContent = "";
  $("save-btn").disabled = true;

  let error = null;
  let peringatan = "";

  if (id) {
    ({ error } = await sb.from("items").update(payload).eq("id", id));
  } else {
    const res = await sb.from("items").insert(payload).select().single();
    error = res.error;

    // stok awal dicatat sebagai transaksi "masuk" supaya riwayatnya konsisten
    if (!error && stokAwal > 0) {
      const tx = await sb.from("transactions").insert({
        item_id: res.data.id,
        jenis: "masuk",
        jumlah: stokAwal,
        keterangan: "Stok awal",
      });
      if (tx.error) {
        peringatan =
          "Barang tersimpan, tetapi stok awal gagal dicatat (" +
          tx.error.message +
          "). Catat lewat tab Transaksi.";
      }
    }
  }

  $("save-btn").disabled = false;

  if (error) {
    $("form-error").textContent =
      error.code === "23505"
        ? "Kode barang sudah dipakai."
        : "Gagal menyimpan: " + error.message;
    return;
  }

  $("barang-dialog").close();
  await loadItems();
  if (peringatan) $("barang-msg").textContent = peringatan;
  else toast(id ? "Perubahan tersimpan." : "Barang berhasil ditambahkan.");
});

async function hapusBarang(item) {
  if (!confirm('Hapus barang "' + item.nama + '"?')) return;

  const { error } = await sb.from("items").delete().eq("id", item.id);
  if (error) {
    $("barang-msg").textContent =
      error.code === "23503"
        ? "Barang ini sudah punya riwayat transaksi, tidak bisa dihapus."
        : "Gagal menghapus: " + error.message;
    return;
  }
  await loadItems();
  toast("Barang dihapus.");
}

/* ---------- Transaksi ---------- */

function fillItemSelect() {
  const sel = $("tx-item");
  const prev = sel.value;
  sel.innerHTML =
    '<option value="">-- pilih barang --</option>' +
    allItems
      .map(
        (i) =>
          '<option value="' + esc(i.id) + '">' +
          esc(i.kode) + " — " + esc(i.nama) +
          " (stok " + fmt(i.stok) + " " + esc(i.satuan) + ")" +
          "</option>"
      )
      .join("");
  if (allItems.some((i) => i.id === prev)) sel.value = prev;
  updateStokInfo();
}

function updateStokInfo() {
  const item = allItems.find((i) => i.id === $("tx-item").value);
  $("tx-unit").textContent = item ? item.satuan : "-";
  $("tx-stok").textContent = item
    ? "Stok saat ini: " + fmt(item.stok) + " " + item.satuan +
      " (minimum " + fmt(item.stok_minimum) + ")"
    : "";
}

$("tx-item").addEventListener("change", updateStokInfo);

async function loadTransactions() {
  const body = $("tx-body");
  body.innerHTML = '<tr><td colspan="6" class="empty">Memuat...</td></tr>';

  const [txRes, profRes] = await Promise.all([
    sb.from("transactions").select("*").order("created_at", { ascending: false }).limit(100),
    sb.from("profiles").select("id, nama"),
  ]);

  if (txRes.error) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty">Gagal memuat: ' + esc(txRes.error.message) + "</td></tr>";
    return;
  }

  const profilMap = {};
  (profRes.data || []).forEach((p) => { profilMap[p.id] = p.nama; });
  const itemMap = {};
  allItems.forEach((i) => { itemMap[i.id] = i; });

  if (txRes.data.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Belum ada transaksi.</td></tr>';
    return;
  }

  body.innerHTML = txRes.data
    .map((t) => {
      const item = itemMap[t.item_id];
      const masuk = t.jenis === "masuk";
      const waktu = new Date(t.created_at).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      return (
        "<tr>" +
        "<td>" + esc(waktu) + "</td>" +
        "<td>" + (item ? esc(item.kode) + " — " + esc(item.nama) : "(barang dihapus)") + "</td>" +
        "<td>" + (masuk ? '<span class="badge ok">Masuk</span>' : '<span class="badge warn">Keluar</span>') + "</td>" +
        "<td>" + (masuk ? "+" : "−") + fmt(t.jumlah) + " " + esc(item ? item.satuan : "") + "</td>" +
        "<td>" + esc(t.keterangan) + "</td>" +
        "<td>" + esc(profilMap[t.user_id] || "-") + "</td>" +
        "</tr>"
      );
    })
    .join("");
}

$("tx-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("tx-msg");
  const itemId = $("tx-item").value;
  const jumlah = Number($("tx-jumlah").value);

  msg.className = "error";
  msg.textContent = "";

  if (!itemId) {
    msg.textContent = "Pilih barang dulu.";
    return;
  }
  if (!(jumlah > 0)) {
    msg.textContent = "Jumlah harus lebih dari 0.";
    return;
  }

  $("tx-btn").disabled = true;
  const { error } = await sb.from("transactions").insert({
    item_id: itemId,
    jenis: $("tx-jenis").value,
    jumlah: jumlah,
    keterangan: $("tx-ket").value.trim() || null,
  });
  $("tx-btn").disabled = false;

  if (error) {
    msg.textContent = error.message.includes("Stok tidak cukup")
      ? error.message
      : "Gagal menyimpan: " + error.message;
    return;
  }

  msg.textContent = "";
  $("tx-jumlah").value = "";
  $("tx-ket").value = "";
  await loadItems();
  await loadTransactions();
  toast("Transaksi tersimpan.");
});

/* ---------- Laporan ---------- */

let lapData = null;

const STATUS_LABEL = { aman: "Aman", menipis: "Menipis", habis: "Habis" };

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function setRange(kind) {
  const now = new Date();
  let a;
  let b = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (kind === "bulan-ini") {
    a = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (kind === "bulan-lalu") {
    a = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    b = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (kind === "tahun-ini") {
    a = new Date(now.getFullYear(), 0, 1);
  } else {
    a = new Date(b);
    a.setDate(a.getDate() - 6);
  }
  $("lap-dari").value = ymd(a);
  $("lap-sampai").value = ymd(b);
}

document.querySelectorAll("[data-range]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setRange(btn.dataset.range);
    generateLaporan();
  });
});
$("lap-tampil").addEventListener("click", generateLaporan);
$("lap-export").addEventListener("click", exportExcel);

function openLaporan() {
  if (!$("lap-dari").value) setRange("bulan-ini");
  generateLaporan();
}

// ambil semua transaksi sejak tanggal mulai (per 1000 baris, supaya tidak terpotong)
async function fetchTransactionsSince(startIso) {
  const all = [];
  const size = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("transactions")
      .select("*")
      .gte("created_at", startIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return all;
}

async function generateLaporan() {
  const dari = $("lap-dari").value;
  const sampai = $("lap-sampai").value;
  const msg = $("lap-msg");
  msg.textContent = "";

  if (!dari || !sampai) {
    msg.textContent = "Isi tanggal Dari dan Sampai.";
    return;
  }
  if (dari > sampai) {
    msg.textContent = "Tanggal Dari tidak boleh setelah tanggal Sampai.";
    return;
  }

  const start = new Date(dari + "T00:00:00");
  const end = new Date(sampai + "T23:59:59.999");

  $("lap-tampil").disabled = true;
  $("lap-body").innerHTML = '<tr><td colspan="7" class="empty">Memuat...</td></tr>';

  try {
    await loadItems();
    const [txs, profRes] = await Promise.all([
      fetchTransactionsSince(start.toISOString()),
      sb.from("profiles").select("id, nama"),
    ]);

    const profilMap = {};
    (profRes.data || []).forEach((p) => { profilMap[p.id] = p.nama; });

    // hitung per barang: masuk/keluar dalam periode, dan mutasi bersih setelah periode
    const stat = {};
    allItems.forEach((i) => { stat[i.id] = { masuk: 0, keluar: 0, sesudah: 0 }; });
    const periodTx = [];

    txs.forEach((t) => {
      const s = stat[t.item_id];
      if (!s) return;
      const jumlah = Number(t.jumlah);
      const tanda = t.jenis === "masuk" ? 1 : -1;
      if (new Date(t.created_at) > end) {
        s.sesudah += tanda * jumlah;
      } else {
        periodTx.push(t);
        if (tanda > 0) s.masuk += jumlah;
        else s.keluar += jumlah;
      }
    });

    const rows = allItems.map((i) => {
      const s = stat[i.id];
      const akhir = Number(i.stok) - s.sesudah;
      const awal = akhir - s.masuk + s.keluar;
      return {
        item: i,
        awal: round6(awal),
        masuk: round6(s.masuk),
        keluar: round6(s.keluar),
        akhir: round6(akhir),
      };
    });

    lapData = { dari, sampai, start, end, rows, periodTx, profilMap };
    renderLaporan();
  } catch (err) {
    lapData = null;
    $("lap-info").textContent = "";
    $("lap-body").innerHTML = '<tr><td colspan="7" class="empty">Laporan tidak bisa ditampilkan.</td></tr>';
    msg.textContent = "Gagal memuat laporan: " + err.message;
  } finally {
    $("lap-tampil").disabled = false;
  }
}

function tglPanjang(d) {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function renderLaporan() {
  const d = lapData;
  const nMasuk = d.periodTx.filter((t) => t.jenis === "masuk").length;
  const nKeluar = d.periodTx.length - nMasuk;

  $("lap-info").textContent =
    "Periode " + tglPanjang(d.start) + " – " + tglPanjang(d.end) +
    " · " + fmt(nMasuk) + " transaksi masuk · " + fmt(nKeluar) + " transaksi keluar";

  if (d.rows.length === 0) {
    $("lap-body").innerHTML = '<tr><td colspan="7" class="empty">Belum ada data barang.</td></tr>';
    return;
  }

  $("lap-body").innerHTML = d.rows
    .map((r) => {
      const masuk = r.masuk > 0
        ? '<td class="r pos">+' + fmt(r.masuk) + "</td>"
        : '<td class="r zero">0</td>';
      const keluar = r.keluar > 0
        ? '<td class="r neg">−' + fmt(r.keluar) + "</td>"
        : '<td class="r zero">0</td>';
      return (
        "<tr>" +
        "<td>" + esc(r.item.kode) + "</td>" +
        "<td>" + esc(r.item.nama) + "</td>" +
        "<td>" + esc(r.item.satuan) + "</td>" +
        '<td class="r">' + fmt(r.awal) + "</td>" +
        masuk +
        keluar +
        '<td class="r"><strong>' + fmt(r.akhir) + "</strong></td>" +
        "</tr>"
      );
    })
    .join("");
}

function exportExcel() {
  const msg = $("lap-msg");
  if (typeof XLSX === "undefined") {
    msg.textContent = "Library Excel belum termuat. Periksa koneksi internet, lalu muat ulang halaman.";
    return;
  }
  if (!lapData) {
    msg.textContent = "Tampilkan laporan dulu sebelum diunduh.";
    return;
  }
  msg.textContent = "";

  const d = lapData;
  const itemMap = {};
  allItems.forEach((i) => { itemMap[i.id] = i; });
  const periodeTeks = tglPanjang(d.start) + " s/d " + tglPanjang(d.end);

  // Sheet 1: mutasi per periode
  const mut = [
    ["Laporan Mutasi Stok"],
    ["Periode", periodeTeks],
    [],
    ["Kode", "Nama", "Kategori", "Satuan", "Stok Awal", "Masuk", "Keluar", "Stok Akhir"],
  ];
  d.rows.forEach((r) => {
    mut.push([
      r.item.kode, r.item.nama, r.item.kategori || "", r.item.satuan,
      r.awal, r.masuk, r.keluar, r.akhir,
    ]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(mut);
  ws1["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 11 }];

  // Sheet 2: stok saat ini
  const now = [["Kode", "Nama", "Kategori", "Satuan", "Stok", "Stok Minimum", "Status"]];
  allItems.forEach((i) => {
    now.push([
      i.kode, i.nama, i.kategori || "", i.satuan,
      Number(i.stok), Number(i.stok_minimum), STATUS_LABEL[statusOf(i)],
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(now);
  ws2["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];

  // Sheet 3: riwayat transaksi pada periode
  const riwayat = [["Waktu", "Kode", "Nama", "Jenis", "Jumlah", "Satuan", "Keterangan", "Petugas"]];
  d.periodTx.forEach((t) => {
    const item = itemMap[t.item_id];
    riwayat.push([
      new Date(t.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }),
      item ? item.kode : "",
      item ? item.nama : "(barang dihapus)",
      t.jenis === "masuk" ? "Masuk" : "Keluar",
      Number(t.jumlah),
      item ? item.satuan : "",
      t.keterangan || "",
      d.profilMap[t.user_id] || "",
    ]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(riwayat);
  ws3["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 32 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Mutasi Periode");
  XLSX.utils.book_append_sheet(wb, ws2, "Stok Saat Ini");
  XLSX.utils.book_append_sheet(wb, ws3, "Riwayat Transaksi");
  XLSX.writeFile(wb, "laporan-stok_" + d.dari + "_sd_" + d.sampai + ".xlsx");
  toast("File Excel diunduh.");
}

/* ---------- Mulai ---------- */

refresh();

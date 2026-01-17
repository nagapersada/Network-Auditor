// KONFIGURASI SUPABASE
const supabaseUrl = 'https://hysjbwysizpczgcsqvuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5c2pid3lzaXpwY3pnY3NxdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MjA2MTYsImV4cCI6MjA3OTQ5NjYxNn0.sLSfXMn9htsinETKUJ5IAsZ2l774rfeaNNmB7mVQcR4';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

let allMembers = [];
let disconnectedList = [];

// Element References
const rootInput = document.getElementById('rootUidInput');
const loading = document.getElementById('loadingState');
const resultPanel = document.getElementById('resultPanel');
const tbody = document.getElementById('auditTableBody');

// FUNGSI PEMBERSIH DATA
const cleanID = (id) => {
    if (!id) return "";
    return String(id).toLowerCase().replace(/\s+/g, '').trim();
};

async function startAudit() {
    const rawRoot = rootInput.value;
    const rootUid = cleanID(rawRoot);

    if (!rootUid) return alert("Wajib memasukkan UID AKAR (Naga Persada) sebagai acuan!");

    loading.style.display = 'flex';
    resultPanel.style.display = 'none';

    try {
        // Ambil SEMUA data anggota
        const { data, error } = await db.from('members').select('*');
        if (error) throw error;
        
        allMembers = data;
        
        // Jalankan Audit Top-Down
        performAuditTopDown(rootUid);

    } catch (err) {
        console.error(err);
        alert("Gagal mengambil data: " + err.message);
        loading.style.display = 'none';
    }
}

function performAuditTopDown(rootUid) {
    disconnectedList = [];
    
    // 1. Peta Anak (Upline -> Daftar Downline)
    // Kita kelompokkan: Siapa saja yang Upline-nya X?
    const childrenMap = new Map(); // Key: Upline Clean ID, Value: Array of Member Objects
    const allMemberMap = new Map(); // Untuk referensi cepat saat render

    allMembers.forEach(m => {
        const rawUid = m.UID || m.uid || m.id;
        const rawUpline = m.Upline || m.upline || m.ref;
        const name = m.Nama || m.nama || m.name || "Tanpa Nama";
        
        const myUid = cleanID(rawUid);
        const myUpline = cleanID(rawUpline);

        if(myUid) {
            // Simpan data member untuk referensi
            const memberObj = { uid: m.UID || m.uid, cleanUid: myUid, cleanUpline: myUpline, name: name };
            allMemberMap.set(myUid, memberObj);

            // Masukkan ke Peta Anak (Dia anak siapa?)
            if (myUpline) {
                if (!childrenMap.has(myUpline)) {
                    childrenMap.set(myUpline, []);
                }
                childrenMap.get(myUpline).push(memberObj);
            }
        }
    });

    // 2. PENELUSURAN DARI AKAR (BREADTH-FIRST TRAVERSAL)
    // Kita mulai dari Root, lalu ambil anaknya, lalu anak dari anaknya, dst.
    const connectedSet = new Set(); // Daftar UID yang TERHUBUNG (Aman)
    
    // Antrian penelusuran (mulai dari Root)
    let queue = [rootUid];
    
    // Jika Root sendiri ada di database anggota, tandai dia aman dulu
    if (allMemberMap.has(rootUid)) {
        connectedSet.add(rootUid);
    }

    while (queue.length > 0) {
        const currentUpline = queue.shift(); // Ambil satu upline dari antrian

        // Cari siapa saja yang upline-nya adalah 'currentUpline'
        const directDownlines = childrenMap.get(currentUpline);

        if (directDownlines && directDownlines.length > 0) {
            directDownlines.forEach(child => {
                // Jika anak ini belum pernah dicatat (mencegah loop)
                if (!connectedSet.has(child.cleanUid)) {
                    connectedSet.add(child.cleanUid); // Tandai AMAN
                    queue.push(child.cleanUid);       // Masukkan ke antrian untuk dicari anaknya nanti
                }
            });
        }
    }

    // 3. BANDINGKAN (CARI YANG HILANG)
    // Loop semua anggota di database. Jika UID-nya TIDAK ADA di 'connectedSet', berarti LIAR.
    allMemberMap.forEach((m, uid) => {
        if (!connectedSet.has(uid)) {
            disconnectedList.push({
                member: m,
                reason: "Jalur Tidak Tersambung ke Root",
                lastKnown: m.cleanUpline || "Tanpa Upline"
            });
        }
    });

    renderResults(connectedSet.size);
    loading.style.display = 'none';
    resultPanel.style.display = 'block';
}

function renderResults(safeCount) {
    document.getElementById('totalScanned').innerText = allMembers.length;
    document.getElementById('totalSafe').innerText = safeCount;
    document.getElementById('totalLost').innerText = disconnectedList.length;

    tbody.innerHTML = '';

    if (disconnectedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:30px; color:#00ff88; font-weight:bold;">✅ SEMUA ANGGOTA SAH (TERHUBUNG KE ROOT)</td></tr>`;
        return;
    }

    disconnectedList.forEach(item => {
        const m = item.member;
        
        // Cek apakah upline-nya ada di DB tapi juga putus? Atau upline-nya memang ga ada?
        let statusKet = "Upline Tidak Dikenal";
        // Logika sederhana: Upline dia tertulis 'X', tapi 'X' tidak tersambung ke akar.
        
        const row = `
            <tr>
                <td>
                    <div style="font-weight:bold; color:#fff;">${m.name}</div>
                    <div style="font-family:monospace; color:var(--gold);">${m.uid}</div>
                </td>
                <td>
                    <div style="font-size:10px; color:#888;">Mengaku Upline:</div>
                    <div style="color:#ff8888; font-family:monospace;">${m.cleanUpline || "(Kosong)"}</div>
                </td>
                <td>
                    <span class="status-badge">Jalur Liar</span>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function downloadReport() {
    if (disconnectedList.length === 0) return alert("Tidak ada data jalur putus untuk diunduh.");
    
    let txt = "LAPORAN AUDIT JARINGAN (TOP-DOWN) - NAGA PERSADA\n";
    txt += "=================================================\n";
    txt += `Metode: Penelusuran dari Root ke Bawah\n`;
    txt += `Root UID: ${rootInput.value}\n`;
    txt += `Total Terputus/Liar: ${disconnectedList.length}\n\n`;
    txt += "Daftar ini adalah anggota yang UID-nya tidak ditemukan saat sistem menelusuri jaringan mulai dari Root.\n\n";
    
    disconnectedList.forEach((item, index) => {
        txt += `${index + 1}. NAMA: ${item.member.name} (UID: ${item.member.uid})\n`;
        txt += `   UPLINE TERTULIS: ${item.member.cleanUpline}\n`;
        txt += "----------------------------------------\n";
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit_liar_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
}

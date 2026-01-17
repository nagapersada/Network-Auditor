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

async function startAudit() {
    const rootUid = rootInput.value.trim();
    if (!rootUid) return alert("Wajib memasukkan UID AKAR (Naga Persada) sebagai acuan!");

    loading.style.display = 'flex';
    resultPanel.style.display = 'none';

    try {
        // [PERBAIKAN] Menggunakan select('*') agar tidak error "column not exist"
        // Script akan menangani variasi huruf besar/kecil (UID/uid) di tahap selanjutnya
        const { data, error } = await db.from('members').select('*');
        
        if (error) throw error;
        
        allMembers = data;
        
        // 2. Proses Audit
        performAudit(rootUid);

    } catch (err) {
        console.error(err);
        alert("Gagal mengambil data: " + err.message);
        loading.style.display = 'none';
    }
}

function performAudit(rootUid) {
    disconnectedList = [];
    let safeCount = 0;

    // Buat Map untuk pencarian cepat (O(1))
    const memberMap = new Map();
    
    allMembers.forEach(m => {
        // [PENTING] Normalisasi Data (Menangani UID/uid, Nama/name, Upline/upline)
        const uid = String(m.UID || m.uid).trim(); 
        const rawUpline = m.Upline || m.upline;
        const upline = rawUpline ? String(rawUpline).trim() : null;
        const name = m.Nama || m.nama || m.name || "Tanpa Nama";
        
        // Simpan ke map hanya jika UID valid
        if(uid) {
            memberMap.set(uid, { uid, name, upline });
        }
    });

    // Loop semua member untuk trace jalur
    memberMap.forEach((member, uid) => {
        // Jika member ini adalah ROOT itu sendiri, skip (Aman)
        if (uid === rootUid) {
            safeCount++;
            return;
        }

        const trace = tracePathToRoot(uid, rootUid, memberMap);
        
        if (trace.status === 'CONNECTED') {
            safeCount++;
        } else {
            // TERPUTUS / ORPHAN
            disconnectedList.push({
                member: member,
                reason: trace.reason,
                lastKnown: trace.lastKnown
            });
        }
    });

    renderResults(safeCount);
    loading.style.display = 'none';
    resultPanel.style.display = 'block';
}

// Fungsi Rekursif Penelusuran Jalur
function tracePathToRoot(startUid, rootUid, map) {
    let currentUid = startUid;
    let visited = new Set(); // Reset visited untuk setiap jalur member

    // Batas loop untuk mencegah infinite loop jika ada circular reference (A->B->A)
    while (currentUid) {
        // Jika ketemu Root, berarti AMAN
        if (currentUid === rootUid) {
            return { status: 'CONNECTED' };
        }

        // Cek Looping
        if (visited.has(currentUid)) {
            return { status: 'DISCONNECTED', reason: 'Looping (Lingkaran Setan)', lastKnown: currentUid };
        }
        visited.add(currentUid);

        const memberData = map.get(currentUid);
        
        // Kasus: Upline tidak ditemukan di database (Data upline ada, tapi orangnya gak ada di tabel)
        if (!memberData) {
            return { status: 'DISCONNECTED', reason: 'Upline Tidak Terdaftar', lastKnown: currentUid };
        }

        // Kasus: Upline kosong (Putus di tengah jalan)
        if (!memberData.upline || memberData.upline === "" || memberData.upline === "-" || memberData.upline === "null") {
            return { status: 'DISCONNECTED', reason: 'Jalur Putus (Tidak ada Upline)', lastKnown: currentUid };
        }

        // Naik ke atas
        currentUid = memberData.upline;
    }

    return { status: 'DISCONNECTED', reason: 'Unknown Error', lastKnown: '?' };
}

function renderResults(safeCount) {
    document.getElementById('totalScanned').innerText = allMembers.length;
    document.getElementById('totalSafe').innerText = safeCount;
    document.getElementById('totalLost').innerText = disconnectedList.length;

    tbody.innerHTML = '';

    if (disconnectedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:30px; color:#00ff88;">✅ SEMUA JALUR AMAN & TERHUBUNG KE NAGA PERSADA</td></tr>`;
        return;
    }

    disconnectedList.forEach(item => {
        const m = item.member;
        const last = item.lastKnown !== m.uid ? item.lastKnown : "Diri Sendiri";
        
        const row = `
            <tr>
                <td>
                    <div style="font-weight:bold; color:#fff;">${m.name}</div>
                    <div style="font-family:monospace; color:var(--gold);">${m.uid}</div>
                </td>
                <td>
                    <div style="font-size:10px; color:#888;">Putus Pada:</div>
                    <div style="color:#ff8888;">${last}</div>
                </td>
                <td>
                    <span class="status-badge">${item.reason}</span>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function downloadReport() {
    if (disconnectedList.length === 0) return alert("Tidak ada data jalur putus untuk diunduh.");
    
    let txt = "LAPORAN AUDIT JARINGAN - NAGA PERSADA\n";
    txt += "========================================\n";
    txt += `Tanggal Audit: ${new Date().toLocaleString()}\n`;
    txt += `Total Putus Jalur: ${disconnectedList.length}\n\n`;
    
    disconnectedList.forEach((item, index) => {
        txt += `${index + 1}. NAMA: ${item.member.name} (UID: ${item.member.uid})\n`;
        txt += `   MASALAH: ${item.reason}\n`;
        txt += `   UPLINE TERAKHIR TERLACAK: ${item.lastKnown}\n`;
        txt += "----------------------------------------\n";
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit_report_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
}

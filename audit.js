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

// FUNGSI PEMBERSIH UID (Super Agresif)
// Mengubah " 814382 " menjadi "814382" agar pencocokan akurat 100%
const cleanID = (id) => {
    if (!id) return "";
    return String(id).toLowerCase().replace(/[^a-z0-9]/g, ''); // Hanya ambil angka dan huruf
};

async function startAudit() {
    const rawRoot = rootInput.value;
    const targetRoot = cleanID(rawRoot); // UID Target (814382)

    if (!targetRoot) return alert("Wajib memasukkan UID Target (814382)!");

    loading.style.display = 'flex';
    resultPanel.style.display = 'none';

    try {
        // Ambil SEMUA data member
        const { data, error } = await db.from('members').select('*');
        if (error) throw error;
        
        allMembers = data;
        
        // Mulai Audit
        runAuditLogic(targetRoot);

    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
        loading.style.display = 'none';
    }
}

function runAuditLogic(targetRoot) {
    disconnectedList = []; // Reset daftar liar
    let safeCount = 0;

    // 1. SIAPKAN PETA DATA (MAP)
    // Supaya pencarian upline cepat, kita masukkan semua ke Map
    const memberMap = new Map();
    
    allMembers.forEach(m => {
        // Deteksi nama kolom variasi (UID/uid/id, Upline/upline/ref)
        const rawUid = m.UID || m.uid || m.id;
        const rawUpline = m.Upline || m.upline || m.ref || m.Referral;
        const name = m.Nama || m.nama || m.name || "Tanpa Nama";

        const myCleanUid = cleanID(rawUid);
        const myCleanUpline = cleanID(rawUpline);
        
        if(myCleanUid) {
            memberMap.set(myCleanUid, { 
                originalUid: rawUid, 
                cleanUpline: myCleanUpline, 
                name: name 
            });
        }
    });

    // 2. MULAI PENELUSURAN SETIAP ANGGOTA
    memberMap.forEach((memberData, currentUid) => {
        
        // Pengecualian: Jika dia sendiri adalah 814382, maka dia AMAN.
        if (currentUid === targetRoot) {
            safeCount++;
            return; 
        }

        // Lakukan penelusuran ke atas...
        const result = checkPathToTarget(currentUid, targetRoot, memberMap);

        if (result.isSafe) {
            safeCount++;
        } else {
            // JIKA GAGAL SAMPAI KE 814382, MASUK DAFTAR HITAM
            disconnectedList.push({
                member: memberData,
                reason: result.reason,
                lastStop: result.lastStop
            });
        }
    });

    renderResults(safeCount, targetRoot);
    loading.style.display = 'none';
    resultPanel.style.display = 'block';
}

// LOGIKA INTI: MEMANJAT KE ATAS SAMPAI KETEMU TARGET
function checkPathToTarget(startUid, targetRoot, map) {
    let cursor = startUid;
    let path = new Set(); // Untuk deteksi looping (muter-muter)
    let maxSteps = 500; // Batas maksimal langkah (jaga-jaga error)

    while (cursor && maxSteps > 0) {
        maxSteps--;

        // [CEK KUNCI] Apakah kita sudah sampai di 814382?
        if (cursor === targetRoot) {
            return { isSafe: true }; // BERHASIL! JALUR SAH.
        }

        // Cek Looping
        if (path.has(cursor)) {
            return { isSafe: false, reason: "Looping (Referral Muter)", lastStop: cursor };
        }
        path.add(cursor);

        // Ambil data upline saat ini
        const data = map.get(cursor);

        // KASUS 1: Data anggota tidak ditemukan di database
        if (!data) {
            // Meskipun tidak ada di DB, jika ID-nya == Target, maka tetap SAH.
            // (Contoh: 814382 mungkin tidak ada di tabel members, tapi dia Upline sah)
            if (cursor === targetRoot) {
                return { isSafe: true };
            }
            // Jika bukan target dan tidak ada di DB, berarti putus.
            return { isSafe: false, reason: "Upline Tidak Terdaftar", lastStop: cursor };
        }

        // KASUS 2: Tidak punya upline (Kosong)
        if (!data.cleanUpline) {
            return { isSafe: false, reason: "Tidak Ada Upline", lastStop: data.originalUid };
        }

        // LANJUT NAIK KE ATAS (Pindah kursor ke Upline)
        cursor = data.cleanUpline;
    }

    return { isSafe: false, reason: "Jalur Terlalu Panjang / Error", lastStop: cursor };
}

function renderResults(safeCount, targetRoot) {
    document.getElementById('totalScanned').innerText = allMembers.length;
    document.getElementById('totalSafe').innerText = safeCount;
    document.getElementById('totalLost').innerText = disconnectedList.length;

    tbody.innerHTML = '';

    if (disconnectedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:30px; color:#00ff88; font-weight:bold;">✅ SEMUA ANGGOTA TERSAMBUNG KE ${targetRoot}</td></tr>`;
        return;
    }

    // Tampilkan yang bermasalah saja
    disconnectedList.forEach(item => {
        const m = item.member;
        const row = `
            <tr>
                <td>
                    <div style="font-weight:bold; color:#fff;">${m.name}</div>
                    <div style="font-family:monospace; color:var(--gold);">${m.originalUid}</div>
                </td>
                <td>
                    <div style="font-size:10px; color:#888;">Berhenti Di:</div>
                    <div style="color:#ff8888; font-family:monospace; font-weight:bold;">${item.lastStop}</div>
                </td>
                <td>
                    <span class="status-badge">${item.reason}</span>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

window.downloadReport = function() {
    if (disconnectedList.length === 0) return alert("Tidak ada data jalur putus.");
    
    let txt = "LAPORAN ANGGOTA ILEGAL / JALUR PUTUS\n";
    txt += "========================================\n";
    txt += `Target Validasi: Sampai ke UID ${rootInput.value}\n`;
    txt += `Total Mencurigakan: ${disconnectedList.length}\n\n`;
    
    disconnectedList.forEach((item, index) => {
        txt += `${index + 1}. NAMA: ${item.member.name} (UID: ${item.member.originalUid})\n`;
        txt += `   MASALAH: ${item.reason}\n`;
        txt += `   JALUR BERHENTI DI: ${item.lastStop} (Bukan Target)\n`;
        txt += "----------------------------------------\n";
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit_liar_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
}

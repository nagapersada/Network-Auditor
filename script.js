// ==========================================
// 1. CONFIGURATION & INIT
// ==========================================
const supabaseUrl = 'https://hysjbwysizpczgcsqvuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5c2pid3lzaXpwY3pnY3NxdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MjA2MTYsImV4cCI6MjA3OTQ5NjYxNn0.sLSfXMn9htsinETKUJ5IAsZ2l774rfeaNNmB7mVQcR4';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

let allMembersCache = [];
let diagram = null;
let growthChart = null;

// LOGIKA PROTEKSI HALAMAN (Jalan Otomatis)
const path = window.location.pathname;
const isLoggedIn = sessionStorage.getItem('isLoggedIn');
// Cek sederhana: Jika tidak ada kata 'index' di URL dan bukan root, maka wajib login
const isLoginPage = path.includes('index.html') || path.endsWith('/') || path.length < 2; 

if (!isLoginPage && !isLoggedIn) {
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Jika sudah di dashboard, muat data
    if (!isLoginPage) {
        await fetchMembersFromSupabase();
        
        if (path.includes('dashboard.html')) initDashboard();
        else if (path.includes('network.html')) initNetwork();
    }
});

// ==========================================
// 2. AUTHENTICATION (FUNGSI LOGIN)
// ==========================================
function login() {
    const u = document.getElementById('username').value.trim(); // .trim() hapus spasi ngga sengaja
    const p = document.getElementById('password').value.trim();
    const err = document.getElementById('error');
    const btn = document.getElementById('loginButton');

    // Reset pesan error
    err.style.display = 'none';

    btn.textContent = 'Verifying...';
    
    // Gunakan setTimeout agar user melihat efek loading sebentar
    setTimeout(() => {
        if (u === 'admin' && p === 'dvteam123') {
            sessionStorage.setItem('isLoggedIn', 'true');
            // Paksa pindah halaman
            window.location.assign('dashboard.html');
        } else {
            err.style.display = 'block';
            err.textContent = 'Username atau Password Salah!';
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> Secure Login';
        }
    }, 500);
}

function logout() {
    sessionStorage.removeItem('isLoggedIn');
    window.location.href = 'index.html';
}

// ==========================================
// 3. DATA HANDLING (SUPABASE)
// ==========================================
async function fetchMembersFromSupabase() {
    try {
        const { data, error } = await db.from('members').select('*');
        if (error) throw error;
        
        allMembersCache = data.map(m => ({
            name: m.Nama || m.nama || m.name || "Unknown",
            uid: String(m.UID || m.uid || m.id || "0"),
            upline: m.Upline || m.upline || null,
            joinDate: m.TanggalBergabung || m.tanggalbergabung || new Date().toISOString()
        }));
        return allMembersCache;
    } catch (e) {
        console.error("Fetch Error:", e);
        // Jangan show alert popup, cukup log saja biar ga ganggu
        return [];
    }
}

async function addMember() {
    const name = document.getElementById('name').value.trim();
    const uid = document.getElementById('uid').value.trim();
    const upline = document.getElementById('upline').value.trim();
    const date = document.getElementById('joinDateInput').value;

    if (!name || !uid) return alert("Nama & UID Wajib diisi!");
    if (allMembersCache.some(m => m.uid === uid)) return alert("UID sudah terdaftar!");

    const payload = { 
        nama: name, 
        uid: uid, 
        upline: upline || null, 
        tanggalbergabung: date ? new Date(date).toISOString() : new Date().toISOString() 
    };

    const btn = document.getElementById('addMemberButton');
    const originalText = btn.textContent;
    btn.textContent = "Menyimpan...";
    btn.disabled = true;

    const { error } = await db.from('members').insert([payload]);
    
    if (error) {
        const { error: err2 } = await db.from('members').insert([{
            Nama: name, UID: uid, Upline: upline || null, TanggalBergabung: payload.tanggalbergabung
        }]);
        if (err2) {
            btn.textContent = originalText;
            btn.disabled = false;
            return alert("Gagal: " + err2.message);
        }
    }

    alert("Anggota berhasil ditambahkan!");
    
    // Clear form
    document.getElementById('name').value = '';
    document.getElementById('uid').value = '';
    document.getElementById('upline').value = '';
    
    // Refresh Data
    await fetchMembersFromSupabase();
    initDashboard(); 
    
    btn.textContent = originalText;
    btn.disabled = false;
}

// ==========================================
// 4. DASHBOARD LOGIC
// ==========================================
function initDashboard() {
    updateStats();
    renderChart();
    
    // Event listeners manual (fallback)
    const addBtn = document.getElementById('addMemberButton');
    if(addBtn) addBtn.onclick = addMember;

    const searchBtn = document.getElementById('searchButton');
    if(searchBtn) searchBtn.onclick = searchMembers;

    const saveEditBtn = document.getElementById('saveEditButton');
    if(saveEditBtn) saveEditBtn.onclick = saveEditedMember;

    const auditBtn = document.getElementById('startAuditButton');
    if(auditBtn) auditBtn.onclick = runAudit;
}

function updateStats() {
    const el = document.getElementById('totalMembers');
    if(el) el.textContent = allMembersCache.length;
}

function searchMembers() {
    const term = document.getElementById('searchTerm').value.toLowerCase();
    const resContainer = document.getElementById('searchResultsContainer');
    
    if(!term) { resContainer.innerHTML = ''; return; }

    const results = allMembersCache.filter(m => 
        m.name.toLowerCase().includes(term) || m.uid.toLowerCase().includes(term)
    );

    if(results.length === 0) {
        resContainer.innerHTML = '<div class="text-center" style="color:#666;">Data tidak ditemukan.</div>';
        return;
    }

    let html = '';
    results.forEach(m => {
        html += `
        <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; margin-bottom:10px; border:1px solid #333;">
            <div style="display:flex; justify-content:space-between;">
                <strong class="text-gold">${m.name}</strong>
                <span style="font-family:monospace; color:#888;">${m.uid}</span>
            </div>
            <div style="font-size:0.8em; color:#aaa; margin-top:5px;">Upline: ${m.upline || '-'}</div>
            <div style="margin-top:10px; display:flex; gap:5px;">
                <button class="btn-secondary" style="padding:5px 10px; font-size:0.7em;" onclick="openEditModal('${m.uid}')">Edit</button>
                <button class="btn-danger" style="padding:5px 10px; font-size:0.7em;" onclick="deleteMember('${m.uid}')">Hapus</button>
            </div>
        </div>`;
    });
    resContainer.innerHTML = html;
}

function renderChart() {
    const ctx = document.getElementById('growthChart');
    if(!ctx) return;
    if(growthChart) growthChart.destroy();

    const counts = {};
    allMembersCache.forEach(m => {
        const d = new Date(m.joinDate);
        if(!isNaN(d)) {
            const key = `${d.getFullYear()}-${d.getMonth()+1}`;
            counts[key] = (counts[key] || 0) + 1;
        }
    });

    const labels = Object.keys(counts).sort();
    const data = labels.map(k => counts[k]);

    growthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Anggota Baru',
                data: data,
                borderColor: '#d4af37',
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#666' }, grid: { display: false } },
                y: { ticks: { color: '#666' }, grid: { color: '#222' } }
            }
        }
    });
}

// ==========================================
// 5. EDIT & DELETE LOGIC
// ==========================================
function openEditModal(uid) {
    const m = allMembersCache.find(x => x.uid === uid);
    if(!m) return;
    document.getElementById('originalUid').value = m.uid;
    document.getElementById('editName').value = m.name;
    document.getElementById('editUid').value = m.uid;
    document.getElementById('editUpline').value = m.upline || '';
    document.getElementById('editJoinDate').value = m.joinDate.split('T')[0];
    
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

async function saveEditedMember() {
    const origUid = document.getElementById('originalUid').value;
    const newUid = document.getElementById('editUid').value;
    
    const payload = {
        nama: document.getElementById('editName').value,
        uid: newUid,
        upline: document.getElementById('editUpline').value || null,
        tanggalbergabung: new Date(document.getElementById('editJoinDate').value).toISOString()
    };

    const { error } = await db.from('members').update(payload).eq('uid', origUid);
    
    if(!error) {
        if(origUid !== newUid) {
            await db.from('members').update({ upline: newUid }).eq('upline', origUid);
        }
        alert("Data diperbarui.");
        closeEditModal();
        await fetchMembersFromSupabase();
        initDashboard();
    } else {
        alert("Gagal update: " + error.message);
    }
}

async function deleteMember(uid) {
    if(!confirm("Yakin hapus?")) return;
    await db.from('members').delete().eq('uid', uid);
    alert("Dihapus.");
    await fetchMembersFromSupabase();
    initDashboard();
}

// ==========================================
// 6. NETWORK VISUALIZATION (GoJS)
// ==========================================
function initNetwork() {
    const $ = go.GraphObject.make;
    diagram = $(go.Diagram, "networkDiagram", {
        layout: $(go.TreeLayout, { angle: 90, layerSpacing: 50 }),
        "undoManager.isEnabled": true,
        initialContentAlignment: go.Spot.Center
    });

    diagram.nodeTemplate = 
        $(go.Node, "Auto",
            $(go.Shape, "RoundedRectangle", { fill: "#1a1a1a", stroke: "#d4af37", strokeWidth: 1 }),
            $(go.Panel, "Vertical", { margin: 8 },
                $(go.TextBlock, { font: "bold 12px Montserrat", stroke: "#d4af37" }, new go.Binding("text", "name")),
                $(go.TextBlock, { font: "10px monospace", stroke: "#888" }, new go.Binding("text", "uid"))
            )
        );

    diagram.linkTemplate =
        $(go.Link, { routing: go.Link.Orthogonal, corner: 5 },
            $(go.Shape, { strokeWidth: 1.5, stroke: "#555" })
        );

    const nodes = allMembersCache.map(m => ({ 
        key: m.uid, 
        name: m.name, 
        uid: m.uid,
        parent: m.upline 
    }));

    diagram.model = new go.TreeModel(nodes);

    const dlBtn = document.getElementById('downloadNetworkButton');
    if(dlBtn) {
        dlBtn.onclick = () => {
            const img = diagram.makeImage({ scale: 2, background: "#0f0f0f" });
            const link = document.createElement('a');
            link.href = img.src;
            link.download = 'DVTEAM_Network.png';
            link.click();
        };
    }
}

// ==========================================
// 7. AUDIT JALUR NAGA (INTELLIGENT AUDIT)
// ==========================================
function openAuditModal() {
    document.getElementById('auditModal').classList.add('active');
    document.getElementById('auditStats').style.display = 'none';
    document.getElementById('auditTableBody').innerHTML = '';
}

function checkLineageRecursive(currentUid, allData, targetRoot, visited = new Set()) {
    if (currentUid === targetRoot) return { ok: true };
    if (visited.has(currentUid)) return { ok: false, msg: "Loop Detected" };
    
    visited.add(currentUid);
    const member = allData.find(m => m.uid === currentUid);

    if (!member) return { ok: false, msg: "Data Missing" };
    if (!member.upline) return { ok: false, msg: "Broken Link (No Upline)" };
    
    const uplineData = allData.find(m => m.uid === member.upline);
    if (!uplineData && member.upline !== targetRoot) return { ok: false, msg: `Ghost Upline (${member.upline})` };

    return checkLineageRecursive(member.upline, allData, targetRoot, visited);
}

function runAudit() {
    const target = document.getElementById('targetRootUid').value.trim();
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gold">Scanning Neural Network...</td></tr>';
    
    setTimeout(() => {
        let valid = 0, invalid = 0;
        let html = '';

        allMembersCache.forEach(m => {
            if(m.uid === target) { valid++; return; }

            const result = checkLineageRecursive(m.uid, allMembersCache, target);
            
            if(result.ok) {
                valid++;
            } else {
                invalid++;
                html += `
                <tr>
                    <td style="color:#e74c3c; font-family:monospace;">${m.uid}</td>
                    <td>${m.name}</td>
                    <td><span class="status-badge status-err">${result.msg}</span></td>
                    <td><button class="btn-secondary" style="padding:2px 8px; font-size:0.7em;" onclick="fixPath('${m.uid}')">Fix</button></td>
                </tr>`;
            }
        });

        document.getElementById('validCount').innerText = valid;
        document.getElementById('invalidCount').innerText = invalid;
        document.getElementById('auditStats').style.display = 'grid';
        
        tbody.innerHTML = html || '<tr><td colspan="4" class="text-center" style="color:#2ecc71; padding:20px;">All Lines Secure.</td></tr>';
    }, 500);
}

function fixPath(uid) {
    document.getElementById('auditModal').classList.remove('active');
    openEditModal(uid);
}

function showMemberList() {
    document.getElementById('mainDashboardContent').style.display = 'none';
    document.getElementById('memberListContainer').style.display = 'block';
    
    const tbody = document.getElementById('memberListTableBody');
    let html = '';
    allMembersCache.forEach((m, i) => {
        html += `<tr>
            <td>${i+1}</td>
            <td>${m.name}</td>
            <td style="font-family:monospace">${m.uid}</td>
            <td>${m.upline || '-'}</td>
            <td>${new Date(m.joinDate).toLocaleDateString()}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function showMainDashboard() {
    document.getElementById('memberListContainer').style.display = 'none';
    document.getElementById('mainDashboardContent').style.display = 'block';
}

function downloadCSV() {
    let csv = "Nama,UID,Upline,JoinDate\n";
    allMembersCache.forEach(m => {
        csv += `"${m.name}",${m.uid},${m.upline||''},${m.joinDate}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'DVTEAM_Data.csv';
    link.click();
}

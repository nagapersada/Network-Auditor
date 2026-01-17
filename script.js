// === CONFIGURATION ===
const supabaseUrl = 'https://hysjbwysizpczgcsqvuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5c2pid3lzaXpwY3pnY3NxdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MjA2MTYsImV4cCI6MjA3OTQ5NjYxNn0.sLSfXMn9htsinETKUJ5IAsZ2l774rfeaNNmB7mVQcR4';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

let globalData = [];
let myDiagram = null;

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    // Cek Login
    if (!sessionStorage.getItem('isLoggedIn') && !window.location.pathname.includes('index.html')) {
        // window.location.href = 'index.html'; // Uncomment jika sudah punya index.html
    }
    
    fetchData(); // Load data awal
});

// === DATA HANDLING ===
async function fetchData(forceRefresh = false) {
    if (forceRefresh) document.getElementById('stat-total').innerText = '...';

    const { data, error } = await db.from('members').select('*');
    
    if (error) {
        console.error("Error fetching:", error);
        alert("Gagal mengambil data dari server.");
        return;
    }

    // Normalisasi Data (PENTING: Atasi huruf besar/kecil dari database)
    globalData = data.map(m => ({
        uid: String(m.UID || m.uid || m.id).trim(),
        name: m.Nama || m.nama || m.name || "Tanpa Nama",
        upline: m.Upline || m.upline || null
    }));

    updateUI();
}

function updateUI() {
    // Update Statistik
    const totalEl = document.getElementById('stat-total');
    if(totalEl) totalEl.innerText = globalData.length;

    // Update Tabel
    const tbody = document.getElementById('table-body');
    if(tbody) {
        let html = '';
        globalData.forEach(m => {
            html += `
            <tr>
                <td style="font-family: monospace; color: var(--gold-main);">${m.uid}</td>
                <td><strong>${m.name}</strong></td>
                <td>${m.upline || '<span style="color:#666; font-style:italic;">ROOT</span>'}</td>
                <td><button class="btn-outline" style="padding: 5px 10px; font-size: 0.7em;" onclick="deleteMember('${m.uid}')">Hapus</button></td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }

    // Jika sedang di tab network, refresh diagram
    if(document.getElementById('view-network').style.display !== 'none') {
        renderDiagram();
    }
}

// === DIAGRAM LOGIC (THE FIX) ===
function renderDiagram() {
    const statusEl = document.getElementById('diagram-status');
    statusEl.innerText = "Membangun struktur...";

    // 1. Inisialisasi GoJS (Hanya sekali)
    const $ = go.GraphObject.make;
    if (!myDiagram) {
        myDiagram = $(go.Diagram, "networkDiagram", {
            "undoManager.isEnabled": true,
            layout: $(go.TreeLayout, { 
                angle: 90, 
                layerSpacing: 50,
                nodeSpacing: 25 
            }),
            initialContentAlignment: go.Spot.Center
        });

        // Template Node (Kotak Emas)
        myDiagram.nodeTemplate = 
            $(go.Node, "Auto",
                $(go.Shape, "RoundedRectangle", { 
                    fill: "#0a0a0a", 
                    stroke: "#C5A059", 
                    strokeWidth: 2,
                    shadowVisible: true, shadowColor: "#C5A059", shadowBlur: 10
                }),
                $(go.Panel, "Vertical", { margin: 10 },
                    $(go.TextBlock, { 
                        font: "bold 12px Cinzel", stroke: "#C5A059", margin: 2 
                    }, new go.Binding("text", "name")),
                    $(go.TextBlock, { 
                        font: "10px monospace", stroke: "#888" 
                    }, new go.Binding("text", "uid"))
                )
            );
        
        // Template Garis (Link)
        myDiagram.linkTemplate =
            $(go.Link, { routing: go.Link.Orthogonal, corner: 10 },
                $(go.Shape, { strokeWidth: 1.5, stroke: "#555" }),
                $(go.Shape, { toArrow: "Standard", stroke: "#555", fill: "#555" })
            );
    }

    // 2. TRANSFORMASI DATA (KUNCI PERBAIKAN)
    // GoJS butuh array node. Jika 'parent' tidak ditemukan, node tidak akan muncul/salah.
    const nodeDataArray = globalData.map(item => {
        let parentKey = item.upline;
        
        // JIKA UPLINE KOSONG/NULL/SAMA DENGAN DIRI SENDIRI -> JADIKAN ROOT (parent: undefined)
        if (!parentKey || parentKey === 'null' || parentKey === '' || parentKey === item.uid) {
            parentKey = undefined; 
        }

        return {
            key: item.uid,
            name: item.name,
            parent: parentKey
        };
    });

    // 3. Masukkan data ke Model
    myDiagram.model = new go.TreeModel(nodeDataArray);
    statusEl.innerText = `Visualisasi Selesai. Menampilkan ${nodeDataArray.length} node.`;
}

// === ACTIONS ===
async function addMember() {
    const name = document.getElementById('reg-name').value;
    const uid = document.getElementById('reg-uid').value;
    const upline = document.getElementById('reg-upline').value;

    if(!name || !uid) return alert("Nama dan UID Wajib!");

    // Cek duplikat lokal dulu biar cepat
    if(globalData.find(m => m.uid === uid)) return alert("UID sudah dipakai!");

    const payload = { 
        nama: name, 
        uid: uid, 
        upline: upline || null 
    };

    const { error } = await db.from('members').insert([payload]);
    if(error) {
        // Coba insert dengan huruf besar (fallback)
        const { error: err2 } = await db.from('members').insert([{
            Nama: name, UID: uid, Upline: upline || null
        }]);
        if(err2) return alert("Gagal Simpan: " + err2.message);
    }

    alert("Anggota Bergabung!");
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-uid').value = '';
    fetchData(); // Refresh
}

async function deleteMember(uid) {
    if(!confirm("Hapus anggota ini? Jalur bawahnya mungkin akan putus.")) return;
    
    const { error } = await db.from('members').delete().eq('uid', uid);
    if(error) await db.from('members').delete().eq('UID', uid); // Coba huruf besar
    
    fetchData();
}

function switchTab(tabName) {
    // Sembunyikan semua
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Tampilkan yg dipilih
    document.getElementById(`view-${tabName}`).style.display = 'block';
    
    // Khusus Network, render ulang saat tab dibuka agar ukurannya pas
    if(tabName === 'network') renderDiagram();
}

function downloadDiagram() {
    if(myDiagram) {
        const img = myDiagram.makeImage({ scale: 2, background: "#000" });
        const link = document.createElement('a');
        link.href = img.src;
        link.download = "Peta_Kekuatan_Naga.png";
        link.click();
    }
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

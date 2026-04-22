// ── Public charity directory web page ─────────────────────────────────────

export function renderDirectoryPage(charities: any[]): string {
  const orgsJson = JSON.stringify(charities);
  const BASE = 'https://donate.charityathletes.org';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>チャリティ一覧 | チャリアス</title>
  <meta property="og:type"        content="website">
  <meta property="og:title"       content="チャリティ一覧 | チャリアス">
  <meta property="og:description" content="チャリアスが認定したチャリティ団体の一覧です。">
  <meta property="og:image"       content="${BASE}/static/logo.png">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh}
    .header{background:linear-gradient(135deg,#FF6B35,#c0392b);color:#fff;padding:28px 20px 36px}
    .header-top{display:flex;align-items:center;gap:10px;margin-bottom:14px}
    .header-top img{width:40px;height:40px;border-radius:9px;object-fit:cover}
    .header-top span{font-size:13px;font-weight:600;opacity:.9}
    .header h1{font-size:24px;font-weight:700;margin-bottom:4px}
    .header p{font-size:14px;opacity:.85}
    .toolbar{margin:16px;display:flex;gap:8px;flex-wrap:wrap}
    .toolbar input{flex:1;min-width:160px;padding:10px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;transition:border .2s}
    .toolbar input:focus{border-color:#FF6B35}
    .toolbar select{padding:10px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;background:#fff;outline:none;transition:border .2s}
    .toolbar select:focus{border-color:#FF6B35}
    .count{margin:0 16px 8px;font-size:13px;color:#86868b}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:0 16px 24px}
    .card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 8px rgba(0,0,0,.07);display:flex;flex-direction:column;gap:10px}
    .card-top{display:flex;align-items:center;gap:12px}
    .avatar{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;flex-shrink:0}
    .card-name{font-weight:600;font-size:14px;line-height:1.3}
    .card-name-ja{font-size:12px;color:#86868b;margin-top:1px}
    .card-desc{font-size:13px;color:#555;line-height:1.55}
    .card-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
    .badge{font-size:11px;padding:3px 9px;border-radius:99px;font-weight:600}
    .featured-badge{font-size:10px;padding:2px 7px;border-radius:99px;background:#E1F5EE;color:#0F6E56;font-weight:600;margin-left:6px}
    .cat-Community{background:#EEEDFE;color:#534AB7}
    .cat-Education{background:#E6F1FB;color:#185FA5}
    .cat-Health{background:#FBEAF0;color:#993556}
    .cat-Environment{background:#EAF3DE;color:#3B6D11}
    .cat-Animal{background:#FAEEDA;color:#854F0B}
    .cat-Disaster{background:#FAECE7;color:#993C1D}
    .links{display:flex;gap:12px;flex-wrap:wrap}
    .link{font-size:12px;color:#86868b;text-decoration:none;transition:color .15s}
    .link:hover{color:#1d1d1f}
    .link-donate{font-size:12px;color:#0F6E56;text-decoration:none;font-weight:500}
    .link-donate:hover{text-decoration:underline}
    .empty{text-align:center;padding:48px;color:#86868b;font-size:14px;display:none}
    .request-btn{display:flex;align-items:center;justify-content:center;margin:0 16px 32px;padding:14px;background:linear-gradient(135deg,#FF6B35,#c0392b);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s}
    .request-btn:hover{opacity:.88}
    .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;align-items:center;justify-content:center;padding:16px}
    .modal-bg.open{display:flex}
    .modal{background:#fff;border-radius:20px;padding:24px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto}
    .modal h2{font-size:18px;font-weight:700;margin-bottom:4px}
    .modal-sub{font-size:13px;color:#86868b;margin-bottom:16px}
    .field{margin-bottom:14px}
    .field label{display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:5px}
    .field input,.field select,.field textarea{width:100%;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;transition:border .2s}
    .field input:focus,.field select:focus,.field textarea:focus{border-color:#FF6B35}
    .field textarea{height:80px;resize:vertical}
    .req{color:#E24B4A}
    .btn-row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
    .btn{padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s}
    .btn-cancel{background:#f0f0f0;border:none;color:#555}
    .btn-cancel:hover{background:#e0e0e0}
    .btn-submit{background:linear-gradient(135deg,#FF6B35,#c0392b);border:none;color:#fff}
    .btn-submit:hover{opacity:.88}
    .success-msg{background:#e8f9ee;border:1px solid #34c759;border-radius:12px;padding:16px;text-align:center;margin:16px;display:none}
    .success-msg h3{color:#1a8736;margin-bottom:6px}
    .success-msg p{font-size:13px;color:#444}
    .footer{text-align:center;padding:20px;font-size:12px;color:#86868b;display:flex;align-items:center;justify-content:center;gap:6px}
    .footer img{width:18px;height:18px;border-radius:4px;opacity:.6}
  </style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <img src="/static/logo.png" alt="チャリアス">
    <span>チャリアス / Charity Athletes</span>
  </div>
  <h1>チャリティ一覧</h1>
  <p>応援できる認定団体を探してみましょう / Browse verified charities</p>
</div>

<div class="toolbar">
  <input type="text" id="search" placeholder="団体名・カテゴリで検索 / Search...">
  <select id="cat-filter">
    <option value="">すべてのカテゴリ / All categories</option>
    <option value="Health">Health</option>
    <option value="Education">Education</option>
    <option value="Environment">Environment</option>
    <option value="Community">Community</option>
    <option value="Animal Welfare">Animal Welfare</option>
    <option value="Disaster Relief">Disaster Relief</option>
  </select>
</div>

<p class="count" id="count"></p>
<div class="grid"  id="grid"></div>
<div class="empty" id="empty">該当する団体が見つかりませんでした</div>
<div class="success-msg" id="success-msg">
  <h3>✅ リクエスト送信完了！</h3>
  <p>ご申請ありがとうございます。審査後にご連絡いたします。<br>Thank you! We'll review your request and get back to you.</p>
</div>

<button class="request-btn" onclick="openModal()">＋ 団体を申請する / Request an org</button>

<div class="modal-bg" id="modal-bg">
  <div class="modal">
    <h2>団体を申請する</h2>
    <p class="modal-sub">DonorBoxに登録済みの団体のみ申請できます。<br>The org must have an active DonorBox profile.</p>
    <div class="field"><label>団体名 / Organization name <span class="req">*</span></label><input type="text" id="r-name" placeholder="e.g. Ocean Cleanup Foundation"></div>
    <div class="field"><label>DonorBox URL <span class="req">*</span></label><input type="url" id="r-donorbox" placeholder="https://donorbox.org/..."></div>
    <div class="field"><label>団体ウェブサイト / Website</label><input type="url" id="r-website" placeholder="https://..."></div>
    <div class="field"><label>カテゴリ / Category <span class="req">*</span></label>
      <select id="r-cat">
        <option value="">選択してください / Select a category</option>
        <option>Health</option><option>Education</option><option>Environment</option>
        <option>Community</option><option>Animal Welfare</option><option>Disaster Relief</option>
      </select>
    </div>
    <div class="field"><label>アスリートが支援すべき理由 / Why should athletes support this org?</label>
      <textarea id="r-reason" placeholder="Tell us about their mission and impact..."></textarea>
    </div>
    <div class="field"><label>あなたの名前 / Your name or athlete profile</label><input type="text" id="r-athlete" placeholder="@username or full name"></div>
    <div class="btn-row">
      <button class="btn btn-cancel" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-submit" onclick="submitRequest()">申請する / Submit</button>
    </div>
  </div>
</div>

<div class="footer">
  <img src="/static/logo.png" alt="">
  Powered by <strong>チャリアス</strong> · Charity Athletes
</div>

<script>
const ALL_ORGS = ${orgsJson};

const CAT_CLASS = {
  'Community':     'cat-Community',
  'Education':     'cat-Education',
  'Health':        'cat-Health',
  'Environment':   'cat-Environment',
  'Animal Welfare':'cat-Animal',
  'Disaster Relief':'cat-Disaster',
};

const CAT_COLORS = {
  'Community':     {bg:'#EEEDFE',tc:'#534AB7'},
  'Education':     {bg:'#E6F1FB',tc:'#185FA5'},
  'Health':        {bg:'#FBEAF0',tc:'#993556'},
  'Environment':   {bg:'#EAF3DE',tc:'#3B6D11'},
  'Animal Welfare':{bg:'#FAEEDA',tc:'#854F0B'},
  'Disaster Relief':{bg:'#FAECE7',tc:'#993C1D'},
};

function render() {
  const q   = document.getElementById('search').value.toLowerCase();
  const cat = document.getElementById('cat-filter').value;
  const filtered = ALL_ORGS.filter(o => {
    const txt = (o.name_en + (o.name_ja||'') + (o.description_en||'') + (o.category||'')).toLowerCase();
    return (!q || txt.includes(q)) && (!cat || o.category === cat);
  });

  document.getElementById('count').textContent =
    filtered.length + ' 団体 / organization' + (filtered.length !== 1 ? 's' : '');

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  document.getElementById('empty').style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(o => {
    const col = CAT_COLORS[o.category] || {bg:'#f0f0f0',tc:'#555'};
    const catCls = CAT_CLASS[o.category] || '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = \`
      <div class="card-top">
        <div class="avatar" style="background:\${col.bg};color:\${col.tc}">\${o.avatar_initials||'??'}</div>
        <div>
          <div class="card-name">\${o.name_en}\${o.is_featured ? '<span class="featured-badge">Featured</span>' : ''}</div>
          \${o.name_ja ? \`<div class="card-name-ja">\${o.name_ja}</div>\` : ''}
        </div>
      </div>
      <div class="card-desc">\${o.description_en||''}</div>
      <div class="card-footer">
        <span class="badge \${catCls}">\${o.category}</span>
      </div>
      <div class="links">
        \${o.website_url ? \`<a class="link" href="\${o.website_url}" target="_blank">🌐 Visit website →</a>\` : ''}
        \${o.donorbox_url ? \`<a class="link-donate" href="\${o.donorbox_url}" target="_blank">❤️ Donate on DonorBox →</a>\` : ''}
      </div>
    \`;
    grid.appendChild(card);
  });
}

function openModal()  { document.getElementById('modal-bg').classList.add('open'); }
function closeModal() { document.getElementById('modal-bg').classList.remove('open'); }

async function submitRequest() {
  const name   = document.getElementById('r-name').value.trim();
  const db     = document.getElementById('r-donorbox').value.trim();
  const cat    = document.getElementById('r-cat').value;
  const reason = document.getElementById('r-reason').value.trim();
  const athlete= document.getElementById('r-athlete').value.trim();
  const website= document.getElementById('r-website').value.trim();

  if (!name || !db || !cat) { alert('必須項目を入力してください / Please fill in required fields.'); return; }
  if (!db.includes('donorbox.org')) { alert('DonorBoxのURLを入力してください (https://donorbox.org/...)'); return; }

  try {
    const res = await fetch('/charities/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_name: name, donorbox_url: db, website_url: website, category: cat, reason, submitted_by: athlete }),
    });
    if (!res.ok) throw new Error('Request failed');
    closeModal();
    ['r-name','r-donorbox','r-website','r-reason','r-athlete'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('r-cat').value = '';
    document.getElementById('success-msg').style.display = 'block';
    document.getElementById('success-msg').scrollIntoView({ behavior:'smooth' });
  } catch(e) {
    alert('エラーが発生しました。もう一度お試しください。 / An error occurred. Please try again.');
  }
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('cat-filter').addEventListener('change', render);
document.getElementById('modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
render();
</script>
</body>
</html>`;
}

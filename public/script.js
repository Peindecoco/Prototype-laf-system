// navbar active highlight
(function(){
  const navLinks = document.querySelectorAll('.navbar a');
  const path = location.pathname.split('/').pop() || 'index.html';
  navLinks.forEach(a=>{
    const href = a.getAttribute('href');
    if(href === path) a.classList.add('active');
  });
})();

// helper: create card element for found item
function createFoundCard(item){
  const card = document.createElement('div');
  card.className = 'card';
  const img = document.createElement('img');
  img.src = item.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image';
  img.alt = item.name || 'Found item';
  card.appendChild(img);

  const bd = document.createElement('div');
  bd.className = 'body';
  const title = document.createElement('h3');
  title.textContent = item.name || 'Unnamed item';
  bd.appendChild(title);

  const desc = document.createElement('p');
  desc.textContent = item.description || '';
  bd.appendChild(desc);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `Color: ${item.color || '-'} • Size: ${item.size || '-'} • Location: ${item.locationFound || '-'}`;
  bd.appendChild(meta);

  const btnRow = document.createElement('div');
  btnRow.style.marginTop = '8px';
  const claimBtn = document.createElement('button');
  claimBtn.className = 'btn';
  claimBtn.textContent = 'Claim';
  claimBtn.dataset.id = item._id;
  btnRow.appendChild(claimBtn);
  bd.appendChild(btnRow);

  card.appendChild(bd);
  return card;
}

// PAGE: found items (index.html)
async function loadFoundItems(){
  const gallery = document.getElementById('foundGallery');
  if(!gallery) return;
  gallery.innerHTML = '';
  try{
    const res = await fetch('/api/items');
    if(!res.ok) throw new Error('Failed to load items');
    const items = await res.json();
    const grid = document.createElement('div');
    grid.className = 'grid';
    items.forEach(it => grid.appendChild(createFoundCard(it)));
    gallery.appendChild(grid);
  }catch(err){
    gallery.textContent = 'Error loading found items.';
    console.error(err);
  }
}

// claim handling (delegation)
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  if(btn.textContent === 'Claim'){
    const id = btn.dataset.id;
    if(!id) return;
    const secret = prompt('Enter secret detail:');
    if(secret === null) return;
    const color = prompt('Color (optional)') || '';
    const size = prompt('Size (optional)') || '';
    const shape = prompt('Shape (optional)') || '';
    try{
      const res = await fetch(`/api/claim/${id}`, {
        method:'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ secretDetail: secret, color, size, shape })
      });
      const json = await res.json();
      if(json.success){
        alert('Match found — item marked claimed. Score: ' + Math.round((json.score||0)*100) + '%');
        loadFoundItems();
      } else {
        alert('Not a match. Score: ' + Math.round((json.score||0)*100) + '%');
      }
    }catch(err){
      alert('Error while claiming: ' + err.message);
    }
  }
});

// PAGE: missing.html loader
async function loadMissing(){
  const list = document.getElementById('missingList');
  if(!list) return;
  list.innerHTML = '';
  try{
    const res = await fetch('/api/missing');
    if(!res.ok) throw new Error('Failed to load missing');
    const items = await res.json();
    items.forEach(it=>{
      const card = document.createElement('div');
      card.className = 'card';
      const bd = document.createElement('div');
      bd.className = 'body';
      const title = document.createElement('h3');
      title.textContent = it.itemName || 'Unnamed';
      bd.appendChild(title);
      const d = document.createElement('p');
      d.textContent = it.description || '';
      bd.appendChild(d);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `Color: ${it.color||'-'} • Size: ${it.size||'-'} • Where: ${it.locationLost||'-'}`;
      bd.appendChild(meta);
      card.appendChild(bd);
      list.appendChild(card);
    });
  }catch(err){
    list.textContent = 'Error loading missing items';
    console.error(err);
  }
}

// PAGE: report.html submit
async function initReportPage(){
  const form = document.getElementById('reportForm');
  if(!form) return;
  form.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const status = document.getElementById('reportStatus');
    status.textContent = 'Submitting...';
    const data = Object.fromEntries(new FormData(form).entries());
    try{
      const res = await fetch('/api/report', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if(res.ok){
        status.textContent = 'Report submitted. Possible matches (if any) shown below:';
        if(json.matches && json.matches.length){
          const mdiv = document.getElementById('reportMatches');
          mdiv.innerHTML = '';
          json.matches.forEach(m=>{
            const wrapper = document.createElement('div');
            wrapper.className = 'card';
            const bd = document.createElement('div'); bd.className='body';
            const t = document.createElement('h3'); t.textContent = m.name || 'Match';
            bd.appendChild(t);
            const p = document.createElement('p'); p.textContent = `Score: ${Math.round(m.score*100)}% — ${m.description || ''}`;
            bd.appendChild(p);
            wrapper.appendChild(bd);
            mdiv.appendChild(wrapper);
          });
        }
        form.reset();
      } else {
        status.textContent = json.error || 'Failed to save report';
      }
    }catch(err){
      status.textContent = 'Error: ' + err.message;
    }
  });
}

// PAGE: admin.html simple hidden admin upload
function initAdminPage(){
  const form = document.getElementById('adminForm');
  if(!form) return;
  form.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const st = document.getElementById('uploadStatus');
    st.textContent = 'Uploading...';
    const fd = new FormData(form);
    try{
      const res = await fetch('/api/admin/add-found', { method:'POST', body: fd });
      const json = await res.json();
      if(res.ok) {
        st.textContent = json.message || 'Uploaded';
        form.reset();
      } else {
        st.textContent = json.error || json.message || 'Failed';
      }
    }catch(err){
      st.textContent = 'Error: ' + err.message;
    }
  });
}

// initialize page-specific code
document.addEventListener('DOMContentLoaded', ()=>{
  loadFoundItems();
  loadMissing();
  initReportPage();
  initAdminPage();
});

let currentUser = null;
async function api(path, opts = {}){
  const defaults = {headers:{'Content-Type':'application/json'}, credentials: 'same-origin'};
  const res = await fetch('/api' + path, Object.assign(defaults, opts));
  if (res.status === 401) {
    // unauthorized — propagate for caller to handle
    const t = await res.text();
    const msg = t || 'unauthorized';
    const err = new Error(msg);
    err.status = 401;
    throw err;
  }
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  try{ return JSON.parse(text); }catch(e){ return text; }
}

async function getMe(){
  try{ const r = await api('/me'); currentUser = r.user; return r.user; }catch(e){ currentUser = null; return null; }
}

function el(tag, props = {}, ...children){
  const e = document.createElement(tag);
  Object.assign(e, props);
  children.forEach(c => typeof c === 'string' ? e.appendChild(document.createTextNode(c)) : e.appendChild(c));
  return e;
}

async function refresh(){
  const feed = document.getElementById('feed');
  feed.innerHTML = 'Cargando...';
  try{
    const posts = await api('/posts');
    feed.innerHTML = '';
    posts.forEach(p => {
      const post = el('div', {className:'post'});
      const header = el('div', {className:'post-header'});
  const authorImg = el('img', {className:'avatar', src: p.author_avatar || '/logo2.png'});
      const meta = el('div', {className:'meta'}, `${p.author} · ${new Date(p.created_at).toLocaleString()}`);
      header.appendChild(authorImg);
      header.appendChild(meta);
      post.appendChild(header);
      const content = el('div', {className:'content'}, p.content);
      const actions = el('div', {className:'actions'});
      const likeBtn = el('button', {className:'button secondary'}, `Like (${p.likes})`);
      likeBtn.addEventListener('click', async () => {
        try{
          likeBtn.disabled = true;
          await api(`/posts/${p.id}/like`, {method:'POST'});
        }catch(err){
          if (err.status === 401) return location.href = '/login.html';
          alert('Error al dar like: '+err.message);
        }finally{ likeBtn.disabled = false; refresh(); }
      });
      const commentInput = el('input', {placeholder:'Escribe un comentario'});
      const commentBtn = el('button', {className:'button secondary'}, 'Comentar');
      commentBtn.addEventListener('click', async () => {
        const txt = (commentInput.value||'').trim();
        if (!txt) return;
        try{
          commentBtn.disabled = true;
          const author = currentUser ? currentUser.username : 'Anon';
          await api(`/posts/${p.id}/comments`, {method:'POST', body: JSON.stringify({text:txt})});
          commentInput.value='';
        }catch(err){
          if (err.status === 401) return location.href = '/login.html';
          alert('Error al comentar: '+err.message);
        }finally{ commentBtn.disabled = false; refresh(); }
      });
      actions.appendChild(likeBtn);
      actions.appendChild(commentInput);
      actions.appendChild(commentBtn);

  // meta already appended inside header
  post.appendChild(content);
      post.appendChild(actions);

      const comments = el('div', {className:'comments'});
      p.comments.forEach(c => comments.appendChild(el('div',{className:'comment'}, `${c.author}: ${c.text}`)));
      post.appendChild(comments);

      feed.appendChild(post);
    });
  }catch(err){
    feed.innerHTML = '';
    if (err.status === 401) return location.href = '/login.html';
    feed.appendChild(el('div',{}, 'Error cargando posts: '+err.message));
    console.error(err);
  }
}

function createLink(text, href){ const a = document.createElement('a'); a.href = href; a.textContent = text; return a; }

window.addEventListener('load', async ()=>{
  const userArea = document.getElementById('userArea');
  const me = await getMe();
  if (me && me.must_change_password){
    // force password change page
    return location.href = '/change_password.html';
  }
  const composer = document.getElementById('composer');
  if (!me){
    userArea.innerHTML = '';
    userArea.appendChild(createLink('Login','/login.html'));
    userArea.appendChild(document.createTextNode(' | '));
    userArea.appendChild(createLink('Register','/register.html'));
    composer.classList.remove('visible');
  } else {
    // show avatar + profile link + logout
    userArea.innerHTML = '';
    const profileLink = document.createElement('a');
    profileLink.href = '/profile.html';
    profileLink.className = 'user-link';
  const img = document.createElement('img'); img.src = me.avatar || '/logo2.png'; img.alt = 'avatar';
    profileLink.appendChild(img);
    const span = document.createElement('span'); span.textContent = me.username;
    profileLink.appendChild(span);
    userArea.appendChild(profileLink);
    const logoutA = document.createElement('a'); logoutA.href='#'; logoutA.id='logoutLink'; logoutA.textContent=' (logout)';
    userArea.appendChild(logoutA);
    composer.classList.add('visible');
    // show admin controls if user is admin
    if (me.is_admin){
      const adminArea = document.getElementById('adminArea');
      adminArea.style.display = 'block';
      const cleanupBtn = document.getElementById('cleanupBtn');
      const cleanupResult = document.getElementById('cleanupResult');
      cleanupBtn.addEventListener('click', async ()=>{
        cleanupBtn.disabled = true;
        cleanupResult.textContent = 'Limpiando...';
        try{
          const r = await api('/cleanup-uploads', {method:'POST'});
          cleanupResult.textContent = 'Borrados: ' + (r.deleted ? r.deleted.length : 0);
        }catch(err){ cleanupResult.textContent = 'Error: '+(err.message||err); }
        cleanupBtn.disabled = false;
      });
    }
    document.getElementById('postBtn').addEventListener('click', async ()=>{
      const content = document.getElementById('content').value.trim();
      if (!content) return;
      await api('/posts', {method:'POST', body: JSON.stringify({content})});
      document.getElementById('content').value='';
      refresh();
    });
    document.getElementById('logoutLink').addEventListener('click', async (e)=>{ e.preventDefault(); await api('/logout',{method:'POST'}); location.reload(); });
  }

  refresh();
});

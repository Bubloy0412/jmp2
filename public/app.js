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
  feed.innerHTML = '<div class="loading" style="height:50px;"></div>';
  try{
    const posts = await api('/posts');
    feed.innerHTML = '';
    posts.forEach(p => {
      const post = el('div', {className:'post'});
      const header = el('div', {className:'post-header'});
  const authorImg = el('img', {className:'avatar', src: p.author_avatar || '/logo2.png'});
      const meta = el('div', {className:'meta'});
      meta.appendChild(el('strong', {}, p.author));
      meta.appendChild(document.createTextNode(' · '));
      meta.appendChild(el('span', {style:'color:var(--text-secondary);font-size:13px;'}, new Date(p.created_at).toLocaleString()));
      header.appendChild(authorImg);
      header.appendChild(meta);
      post.appendChild(header);
      const content = el('div', {className:'content'}, p.content);
      if (p.image) {
        const img = el('img', {className:'post-image', src: p.image, alt: 'Post image'});
        post.appendChild(img);
      }
      const actions = el('div', {className:'actions'});
      const likeBtn = el('button', {className:'button secondary like'}, `Like (${p.likes})`);
      likeBtn.addEventListener('click', async () => {
        try{
          likeBtn.disabled = true;
          likeBtn.classList.add('animate');
          await api(`/posts/${p.id}/like`, {method:'POST'});
        }catch(err){
          if (err.status === 401) return location.href = '/login.html';
          alert('Error al dar like: '+err.message);
        }finally{
          likeBtn.disabled = false;
          setTimeout(() => likeBtn.classList.remove('animate'), 600);
          refresh();
        }
      });
      actions.appendChild(likeBtn);

      // Add edit/delete buttons if current user is the author
      if (currentUser && p.author === currentUser.username) {
        const editBtn = el('button', {className:'button secondary'}, 'Editar');
        editBtn.addEventListener('click', () => {
          showEditModal(p);
        });
        actions.appendChild(editBtn);

        const deleteBtn = el('button', {className:'button secondary delete'}, 'Eliminar');
        deleteBtn.addEventListener('click', async () => {
          if (confirm('¿Estás seguro de que quieres eliminar este post?')) {
            try {
              await api(`/posts/${p.id}`, {method:'DELETE'});
              refresh();
            } catch (err) {
              if (err.status === 401) return location.href = '/login.html';
              alert('Error al eliminar post: ' + err.message);
            }
          }
        });
        actions.appendChild(deleteBtn);
      }

      const commentGroup = el('div', {className:'comment-group'});
      const commentInput = el('input', {placeholder:'Escribe un comentario'});
      const commentBtn = el('button', {className:'button'}, 'Comentar');
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
      commentGroup.appendChild(commentInput);
      commentGroup.appendChild(commentBtn);
      actions.appendChild(commentGroup);

  // meta already appended inside header
  post.appendChild(content);
      post.appendChild(actions);

      const comments = el('div', {className:'comments'});
      p.comments.forEach(c => comments.appendChild(el('div',{className:'comment'}, el('strong', {}, c.author), `: ${c.text}`)));
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

function showEditModal(post) {
  const modal = el('div', {className: 'modal', style: 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;'});
  const modalContent = el('div', {className: 'modal-content', style: 'background:white;padding:20px;border-radius:8px;max-width:500px;width:90%;'});
  const closeBtn = el('button', {className: 'button secondary', style: 'float:right;'}, 'X');
  closeBtn.addEventListener('click', () => document.body.removeChild(modal));
  modalContent.appendChild(closeBtn);

  const title = el('h3', {}, 'Editar Post');
  modalContent.appendChild(title);

  const contentTextarea = el('textarea', {value: post.content, style: 'width:100%;height:100px;margin:10px 0;'});
  modalContent.appendChild(contentTextarea);

  const imageInput = el('input', {type: 'file', accept: 'image/*', style: 'margin:10px 0;'});
  modalContent.appendChild(imageInput);

  const musicInput = el('input', {type: 'url', placeholder: 'URL de música (opcional)', value: post.music_url || '', style: 'width:100%;margin:10px 0;'});
  modalContent.appendChild(musicInput);

  const saveBtn = el('button', {className: 'button'}, 'Guardar');
  saveBtn.addEventListener('click', async () => {
    const newContent = contentTextarea.value.trim();
    const file = imageInput.files[0];
    let newImageUrl = post.image;
    const newMusicUrl = musicInput.value.trim();

    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      try {
        const uploadRes = await fetch('/api/upload-post-image', {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
        newImageUrl = uploadData.imageUrl;
      } catch (err) {
        alert('Error uploading image: ' + err.message);
        return;
      }
    }

    try {
      await api(`/posts/${post.id}`, {method: 'PUT', body: JSON.stringify({content: newContent, image: newImageUrl, music_url: newMusicUrl})});
      document.body.removeChild(modal);
      refresh();
    } catch (err) {
      if (err.status === 401) return location.href = '/login.html';
      alert('Error al editar post: ' + err.message);
    }
  });
  modalContent.appendChild(saveBtn);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

let offset = 0;
const limit = 10;

async function loadMorePosts() {
  try {
    const posts = await api(`/posts?limit=${limit}&offset=${offset}`);
    const feed = document.getElementById('feed');
    if (offset === 0) feed.innerHTML = '';
    posts.forEach(p => {
      const post = el('div', {className:'post'});
      const header = el('div', {className:'post-header'});
      const authorImg = el('img', {className:'avatar', src: p.author_avatar || '/logo2.png'});
      const meta = el('div', {className:'meta'});
      meta.appendChild(el('strong', {}, p.author));
      meta.appendChild(document.createTextNode(' · '));
      meta.appendChild(el('span', {style:'color:var(--text-secondary);font-size:13px;'}, new Date(p.created_at).toLocaleString()));
      header.appendChild(authorImg);
      header.appendChild(meta);
      post.appendChild(header);
      const content = el('div', {className:'content'}, p.content);
      if (p.image) {
        const img = el('img', {className:'post-image', src: p.image, alt: 'Post image'});
        post.appendChild(img);
      }
      const actions = el('div', {className:'actions'});
      const likeBtn = el('button', {className:'button secondary like'}, `Like (${p.likes})`);
      likeBtn.addEventListener('click', async () => {
        try{
          likeBtn.disabled = true;
          likeBtn.classList.add('animate');
          await api(`/posts/${p.id}/like`, {method:'POST'});
        }catch(err){
          if (err.status === 401) return location.href = '/login.html';
          alert('Error al dar like: '+err.message);
        }finally{
          likeBtn.disabled = false;
          setTimeout(() => likeBtn.classList.remove('animate'), 600);
          refresh();
        }
      });
      actions.appendChild(likeBtn);

      // Add edit/delete buttons if current user is the author
      if (currentUser && p.author === currentUser.username) {
        const editBtn = el('button', {className:'button secondary'}, 'Editar');
        editBtn.addEventListener('click', () => {
          showEditModal(p);
        });
        actions.appendChild(editBtn);

        const deleteBtn = el('button', {className:'button secondary delete'}, 'Eliminar');
        deleteBtn.addEventListener('click', async () => {
          if (confirm('¿Estás seguro de que quieres eliminar este post?')) {
            try {
              await api(`/posts/${p.id}`, {method:'DELETE'});
              refresh();
            } catch (err) {
              if (err.status === 401) return location.href = '/login.html';
              alert('Error al eliminar post: ' + err.message);
            }
          }
        });
        actions.appendChild(deleteBtn);
      }

      const commentGroup = el('div', {className:'comment-group'});
      const commentInput = el('input', {placeholder:'Escribe un comentario'});
      const commentBtn = el('button', {className:'button'}, 'Comentar');
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
      commentGroup.appendChild(commentInput);
      commentGroup.appendChild(commentBtn);
      actions.appendChild(commentGroup);

      post.appendChild(content);
      post.appendChild(actions);

      const comments = el('div', {className:'comments'});
      p.comments.forEach(c => comments.appendChild(el('div',{className:'comment'}, el('strong', {}, c.author), `: ${c.text}`)));
      post.appendChild(comments);

      feed.appendChild(post);
    });
    offset += limit;
  } catch (err) {
    if (err.status === 401) return location.href = '/login.html';
    console.error('Error loading more posts:', err);
  }
}

async function refresh(){
  offset = 0;
  await loadMorePosts();
}

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
    // personalize placeholder
    const contentTextarea = document.getElementById('content');
    contentTextarea.placeholder = `¿Qué rolón vas a compartir hoy, ${me.username}?`;
    // show user avatar thumb
    const userAvatarThumb = document.getElementById('userAvatarThumb');
    userAvatarThumb.innerHTML = '';
    const thumbImg = document.createElement('img');
    thumbImg.src = me.avatar || '/logo2.png';
    thumbImg.alt = 'Tu avatar';
    userAvatarThumb.appendChild(thumbImg);
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
      const fileInput = document.getElementById('fileInput');
      const file = fileInput.files[0];
      let imageUrl = null;

      if (file) {
        // upload image first
        const formData = new FormData();
        formData.append('image', file);
        try {
          const uploadRes = await fetch('/api/upload-post-image', {
            method: 'POST',
            credentials: 'same-origin',
            body: formData
          });
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
          imageUrl = uploadData.imageUrl;
        } catch (err) {
          alert('Error uploading image: ' + err.message);
          return;
        }
      }

      if (!content && !imageUrl) return;

      await api('/posts', {method:'POST', body: JSON.stringify({content, image: imageUrl})});
      document.getElementById('content').value = '';
      fileInput.value = '';
      refresh();
    });
    document.getElementById('logoutLink').addEventListener('click', async (e)=>{ e.preventDefault(); await api('/logout',{method:'POST'}); location.reload(); });
  }

  refresh();

  // Infinite scroll
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
      loadMorePosts();
    }
  });

  // Search functionality
  const searchInput = document.getElementById('searchInput');
  const searchDropdown = document.getElementById('searchDropdown');
  const searchPosts = document.getElementById('searchPosts');
  const searchUsers = document.getElementById('searchUsers');

  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (query.length > 2) {
      searchTimeout = setTimeout(async () => {
        try {
          const results = await api(`/search?q=${encodeURIComponent(query)}`);
          searchPosts.innerHTML = '';
          searchUsers.innerHTML = '';
          if (results.posts && results.posts.length > 0) {
            results.posts.forEach(p => {
              const postEl = el('div', {className: 'search-item'}, el('strong', {}, p.author), `: ${p.content.substring(0, 50)}...`);
              postEl.addEventListener('click', () => {
                // Scroll to post or highlight it
                searchDropdown.style.display = 'none';
              });
              searchPosts.appendChild(postEl);
            });
          } else {
            searchPosts.innerHTML = '<p>No posts found</p>';
          }
          if (results.users && results.users.length > 0) {
            results.users.forEach(u => {
              const userEl = el('div', {className: 'search-item'}, el('img', {src: u.avatar || '/logo2.png', style: 'width:20px;height:20px;margin-right:5px;'}), el('strong', {}, u.username));
              userEl.addEventListener('click', () => {
                window.location.href = `/profile.html?user=${u.username}`;
              });
              searchUsers.appendChild(userEl);
            });
          } else {
            searchUsers.innerHTML = '<p>No users found</p>';
          }
          searchDropdown.style.display = 'block';
        } catch (err) {
          console.error('Search error:', err);
        }
      }, 300);
    } else {
      searchDropdown.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.style.display = 'none';
    }
  });
});

const http = require('http');

function req(method, path, body, cookie){
  return new Promise((resolve, reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const opts = {host:'localhost', port:3000, path, method, headers: {'Content-Type':'application/json'}};
    if (cookie) opts.headers['Cookie'] = cookie;
    const r = http.request(opts, res => {
      let b='';
      res.on('data', c=> b+=c);
      res.on('end', ()=>{
        resolve({status: res.statusCode, headers: res.headers, body: b});
      });
    });
    r.on('error', e=> reject(e));
    if (data) r.write(data);
    r.end();
  });
}

(async ()=>{
  try{
    console.log('1) GET /api/me (sin cookie)');
    let r = await req('GET','/api/me');
    console.log(r.status, r.body);

    console.log('\n2) POST /api/register (crear cuenta testuser)');
    r = await req('POST','/api/register',{username:'testuser', password:'testpass'});
    console.log(r.status, r.body);
    const setCookie = r.headers['set-cookie'];
    let cookie;
    if (!setCookie){
      console.log('Registro no devolvió cookie, intentando login (posible usuario ya existente)');
      const lr = await req('POST','/api/login',{username:'testuser', password:'testpass'});
      if (lr.status !== 200){
        return console.error('No se pudo obtener cookie por registro ni login', lr.status, lr.body);
      }
      const sc = lr.headers['set-cookie'];
      if (!sc) return console.error('Login no devolvió cookie');
      cookie = sc.map(s => s.split(';')[0]).join('; ');
      console.log('Cookie obtenida por login:', cookie);
    } else {
      cookie = setCookie.map(s => s.split(';')[0]).join('; ');
      console.log('Cookie capturada en register:', cookie);
    }

    console.log('\n3) GET /api/me (con cookie)');
    r = await req('GET','/api/me', null, cookie);
    console.log(r.status, r.body);

    console.log('\n4) POST /api/posts (crear post)');
    r = await req('POST','/api/posts',{content:'Post de prueba desde E2E'}, cookie);
    console.log(r.status, r.body);
    const created = JSON.parse(r.body);
    const postId = created.id;

    console.log('\n5) GET /api/posts (comprobar post existe)');
    r = await req('GET','/api/posts', null, cookie);
    console.log(r.status, r.body.slice(0,400));

    console.log('\n6) POST /api/posts/:id/like');
    r = await req('POST',`/api/posts/${postId}/like`, null, cookie);
    console.log(r.status, r.body);

    console.log('\n7) POST /api/posts/:id/comments');
    r = await req('POST',`/api/posts/${postId}/comments`, {text:'Comentario E2E'}, cookie);
    console.log(r.status, r.body);

    console.log('\n8) GET /api/posts (comprobar like y comentario)');
    r = await req('GET','/api/posts', null, cookie);
    console.log(r.status);
    const posts = JSON.parse(r.body);
    const p = posts.find(x=>x.id===postId);
    console.log('Post encontrado:', p ? 'sí' : 'no');
    if (p){
      console.log('likes:', p.likes);
      console.log('comments:', p.comments.map(c=>c.text));
    }

    console.log('\nE2E finished');
  }catch(e){
    console.error('Error E2E:', e);
  }
})();
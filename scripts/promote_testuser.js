const http = require('http');

function req(method, path, body, cookie){
  return new Promise((resolve, reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const opts = {host:'localhost', port:3000, path, method, headers: {'Content-Type':'application/json'}};
    if (cookie) opts.headers['Cookie'] = cookie;
    const r = http.request(opts, res => {
      let b='';
      res.on('data', c=> b+=c);
      res.on('end', ()=> resolve({status: res.statusCode, headers: res.headers, body: b}));
    });
    r.on('error', e=> reject(e));
    if (data) r.write(data);
    r.end();
  });
}

(async ()=>{
  try{
    console.log('Login admin');
    let r = await req('POST','/api/login',{username:'admin', password:'admin'});
    console.log(r.status, r.body);
    const sc = r.headers['set-cookie'];
    if (!sc) return console.log('no cookie from admin login');
    const cookie = sc.map(s=>s.split(';')[0]).join('; ');
    console.log('cookie:', cookie);

    // find user testuser id
    r = await req('GET','/api/posts', null, cookie);
    console.log('posts status', r.status);

    // get users list
    r = await req('GET','/api/users/2', null, cookie);
    console.log('GET /api/users/2', r.status, r.body);

    // attempt promote user id 2
    r = await req('POST','/api/make-admin/2', null, cookie);
    console.log('promote result', r.status, r.body);
  }catch(e){ console.error(e); }
})();

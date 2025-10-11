const http = require('http');
function req(method, path, body, cookie){
  return new Promise((resolve, reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const opts = {host:'localhost', port:3000, path, method, headers: {'Content-Type': 'application/json'}};
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
    console.log('Login testuser');
    let r = await req('POST','/api/login',{username:'testuser', password:'testpass'});
    console.log('login status', r.status);
    const sc = r.headers['set-cookie'];
    if (!sc) return console.log('no cookie from login');
    const cookie = sc.map(s=>s.split(';')[0]).join('; ');
    console.log('cookie:', cookie);

    r = await req('POST','/api/cleanup-uploads', null, cookie);
    console.log('cleanup status', r.status, r.body);
  }catch(e){ console.error(e); }
})();

const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');

// Assumption: change passwords for 'admin' and 'testuser'.
// If you want different usernames, run this script with arguments: node set_passwords.js alice:pass bob:pass

async function setPasswords(pairs){
  const db = await open({ filename: path.join(__dirname,'..','data.sqlite'), driver: sqlite3.Database });
  const results = {};
  for(const [username, pwd] of pairs){
    const hash = await bcrypt.hash(pwd, 10);
    const existing = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (existing){
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, existing.id);
      results[username] = { action: 'updated', id: existing.id, password: pwd };
    } else {
      const r = await db.run('INSERT INTO users (username,password_hash) VALUES (?,?)', username, hash);
      results[username] = { action: 'created', id: r.lastID, password: pwd };
    }
  }
  await db.close();
  return results;
}

function generatePassword(){
  return crypto.randomBytes(12).toString('hex'); // 24 hex chars
}

function tryLogin(username, password){
  return new Promise((resolve,reject)=>{
    const data = JSON.stringify({ username, password });
    const opts = { host: 'localhost', port: 3000, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(opts, res => {
      let b = '';
      res.on('data', c=> b+=c);
      res.on('end', ()=>{
        resolve({ status: res.statusCode, body: b, headers: res.headers });
      });
    });
    req.on('error', e=> reject(e));
    req.write(data);
    req.end();
  });
}

(async ()=>{
  try{
    const args = process.argv.slice(2);
    let pairs = [];
    if (args.length === 0){
      pairs = [['admin', generatePassword()], ['testuser', generatePassword()]];
    } else {
      for(const a of args){
        if (a.includes(':')){ const [u,p] = a.split(':'); pairs.push([u,p]); } else { pairs.push([a, generatePassword()]); }
      }
    }
    const res = await setPasswords(pairs);
    console.log('Password update results:');
    for(const k of Object.keys(res)){
      console.log(k, res[k].action, 'id='+res[k].id, 'password='+res[k].password);
    }

    // Try login for each
    for(const [username, pwd] of pairs){
      const r = await tryLogin(username, pwd);
      console.log('Login attempt', username, '=>', r.status, r.body.slice(0,200));
    }
  }catch(e){ console.error('Error:', e); process.exit(1); }
})();

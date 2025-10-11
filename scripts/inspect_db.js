const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
(async ()=>{
  const db = await open({ filename: path.join(__dirname,'..','data.sqlite'), driver: sqlite3.Database });
  const info = await db.all("PRAGMA table_info('users')");
  console.log('users table info:', info);
  const users = await db.all('SELECT id,username,password_hash,avatar,is_admin FROM users');
  console.log('users rows:', users);
  process.exit(0);
})();

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
(async ()=>{
  const db = await open({ filename: path.join(__dirname,'..','data.sqlite'), driver: sqlite3.Database });
  await db.run("UPDATE users SET must_change_password = 1 WHERE username = 'admin'");
  console.log('Set must_change_password=1 for admin');
  process.exit(0);
})();

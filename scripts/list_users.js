const db = require('../db');
(async ()=>{
  const users = await db.getAllUsers();
  console.log(users);
  process.exit(0);
})();

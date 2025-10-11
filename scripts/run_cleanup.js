const path = require('path');
const server = require('../server');

// server exports nothing; we require db and server cleanup function via hack
(async ()=>{
  // attempt to call cleanupUploads if present
  if (server && server.cleanupUploads){
    const r = await server.cleanupUploads();
    console.log('cleanup result', r);
  } else {
    console.log('cleanup function not exported from server.js');
  }
  process.exit(0);
})();

# Fix Segmentation Fault on Render Deployment

## Tasks
- [x] Update sharp to latest version in package.json
- [x] Add postinstall script to rebuild sharp for deployment platform
- [x] Test the changes locally (server starts without segfault, basic endpoints work)
- [ ] Deploy to Render to verify fix

## Notes
- Segmentation fault likely due to sharp native binaries incompatibility on Render's Node.js 22.16.0 environment
- Postinstall rebuild ensures binaries are compiled for the target platform
- Local testing shows server starts successfully and basic endpoints respond (health check, posts retrieval)
- CSRF protection blocks unauthenticated POST requests, which is expected behavior

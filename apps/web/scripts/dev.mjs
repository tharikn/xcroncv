// Dev loop: incremental `ng build --watch` + static server. Reload the browser after a rebuild.
// Use a dedicated output dir so `npm run web:build` (production, dist/web) cannot replace the
// dev bundle while this server is running.
import { spawn } from 'node:child_process';

const devDist = 'dist/web-dev';
const run = (cmd, args, env = process.env) => spawn(cmd, args, { stdio: 'inherit', shell: true, env });
const build = run('npx', ['ng', 'build', '--watch', '--configuration', 'development', '--output-path', devDist]);
const serve = run('node', ['scripts/serve.mjs'], { ...process.env, WEB_ROOT: `${devDist}/browser` });
const stop = () => { build.kill(); serve.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

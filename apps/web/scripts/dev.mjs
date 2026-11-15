// Dev loop: incremental `ng build --watch` + static server. Reload the browser after a rebuild.
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: true });
const build = run('npx', ['ng', 'build', '--watch', '--configuration', 'development']);
const serve = run('node', ['scripts/serve.mjs']);
const stop = () => { build.kill(); serve.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

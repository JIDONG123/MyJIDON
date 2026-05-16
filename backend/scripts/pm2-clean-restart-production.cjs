/**
 * 生产：结束占用 3000 的进程 → 删除 PM2 中全部应用 → 启动 smart-grading-api → 打印列表后退出。
 * 避免部分环境下 `pm2 start` CLI 长时间不返回的问题（改用 PM2 programmatic API）。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const logDir = path.join(root, 'logs', 'pm2');

function loadPm2() {
  try {
    return require('pm2');
  } catch (_) {
    const g = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'pm2');
    if (fs.existsSync(path.join(g, 'index.js')) || fs.existsSync(path.join(g, 'lib', 'API.js'))) {
      return require(g);
    }
  }
  throw new Error('找不到 pm2 模块，请先全局安装: npm i -g pm2');
}

function killPort3000() {
  if (process.platform !== 'win32') {
    try {
      execSync('fuser -k 3000/tcp', { stdio: 'ignore' });
    } catch (_) {
      /* ignore */
    }
    return;
  }
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      '& { $pids = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($p in $pids) { if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } }',
    ],
    { stdio: 'inherit' }
  );
}

function deleteAllPm2Apps(pm2, cb) {
  pm2.list((err, list) => {
    if (err) return cb(err);
    const names = [...new Set((list || []).map((p) => p.name).filter(Boolean))];
    if (!names.length) return cb(null);
    let i = 0;
    const next = () => {
      if (i >= names.length) return cb(null);
      const name = names[i++];
      pm2.delete(name, () => next());
    };
    next();
  });
}

function main() {
  killPort3000();

  const pm2 = loadPm2();
  pm2.connect((connErr) => {
    if (connErr) {
      console.error(connErr);
      process.exit(1);
    }
    deleteAllPm2Apps(pm2, (delErr) => {
      if (delErr) {
        console.error(delErr);
        pm2.disconnect();
        process.exit(1);
      }
      pm2.start(
        {
          name: 'smart-grading-api',
          script: path.join(root, 'cluster.js'),
          cwd: root,
          interpreter: 'node',
          exec_mode: 'fork',
          instances: 1,
          autorestart: true,
          windowsHide: true,
          kill_timeout: 8000,
          shutdown_with_message: false,
          min_uptime: 10000,
          max_restarts: 15,
          restart_delay: 4000,
          exp_backoff_restart_delay: 4000,
          max_memory_restart: '1536M',
          merge_logs: false,
          time: true,
          log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
          error_file: path.join(logDir, 'smart-grading-api-error.log'),
          out_file: path.join(logDir, 'smart-grading-api-out.log'),
          env: {
            NODE_ENV: 'production',
            PORT: process.env.PORT || '3000',
            USE_CLUSTER: '1',
          },
        },
        (startErr, apps) => {
          if (startErr) {
            console.error(startErr);
            pm2.disconnect();
            process.exit(1);
          }
          console.log('PM2 start OK:', (apps || []).map((a) => a && a.pm2_env && a.pm2_env.name).filter(Boolean));
          pm2.list((listErr, procList) => {
            if (listErr) console.error(listErr);
            else {
              const brief = (procList || []).map((p) => ({
                name: p.name,
                status: p.pm2_env && p.pm2_env.status,
                pid: p.pid,
                pm_id: p.pm_id,
                restart_time: p.pm2_env && p.pm2_env.restart_time,
              }));
              console.log(JSON.stringify(brief, null, 2));
            }
            pm2.disconnect();
            process.exit(listErr ? 1 : 0);
          });
        }
      );
    });
  });
}

main();

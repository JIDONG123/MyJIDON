const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const MAX_TOTAL_OUT = 49152;
const DEFAULT_TIMEOUT_MS = 8000;

function pythonCmd() {
  const fromEnv = (process.env.QB_PYTHON_BIN || '').trim();
  if (fromEnv) return fromEnv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * 本地受限试运行学生 Python 代码（进程级超时与输出上限；非强隔离，生产请换容器/判题服务）。
 */
async function runStudentPython(source, options = {}) {
  const timeoutMs = Math.min(15000, Math.max(2000, options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const src = String(source || '').slice(0, 96000);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qb-code-'));
  const scriptPath = path.join(dir, 'main.py');
  await fs.writeFile(scriptPath, src, 'utf8');
  const cmd = pythonCmd();
  const args = ['-I', '-B', scriptPath];

  const cleanup = async () => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let totalLen = 0;

    const killChild = () => {
      try {
        child.kill('SIGKILL');
      } catch {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      }
    };

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    const child = spawn(cmd, args, {
      cwd: dir,
      env: { ...process.env, PYTHONHASHSEED: '0', PYTHONUTF8: '1' },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killChild();
      finish({
        ok: false,
        exitCode: null,
        stdout: stdout.slice(0, MAX_TOTAL_OUT),
        stderr: `${stderr}\n（已超时终止）`.trim(),
        timedOut: true,
      });
    }, timeoutMs);

    const onChunk = (which, chunk) => {
      if (settled) return;
      const s = chunk.toString();
      totalLen += s.length;
      if (totalLen > MAX_TOTAL_OUT) {
        killChild();
        finish({
          ok: false,
          exitCode: null,
          stdout: stdout.slice(0, MAX_TOTAL_OUT),
          stderr: `${stderr}\n（输出过长已终止）`.trim(),
          timedOut: false,
        });
        return;
      }
      if (which === 'out') stdout += s;
      else stderr += s;
    };

    child.stdout.on('data', (d) => onChunk('out', d));
    child.stderr.on('data', (d) => onChunk('err', d));

    child.on('error', (err) => {
      finish({
        ok: false,
        exitCode: null,
        stdout: stdout.slice(0, MAX_TOTAL_OUT),
        stderr: err.message || '无法启动 Python（请安装 Python 或设置环境变量 QB_PYTHON_BIN）',
        timedOut: false,
      });
    });

    child.on('close', (code) => {
      finish({
        ok: code === 0,
        exitCode: code,
        stdout: stdout.slice(0, MAX_TOTAL_OUT),
        stderr: stderr.slice(0, MAX_TOTAL_OUT),
        timedOut: false,
      });
    });
  }).finally(cleanup);
}

module.exports = { runStudentPython, pythonCmd };

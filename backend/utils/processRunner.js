/**
 * 受限子进程执行（timeout + 输出上限），供 Host adapter 使用
 */
const { spawn } = require('child_process');

/**
 * @param {string} command
 * @param {string[]} args
 * @param {object} options cwd, env, timeoutMs, maxOutputBytes, input
 * @returns {Promise<{ exitCode: number|null, stdout: string, stderr: string, timedOut: boolean, outputTruncated: boolean, errorMessage?: string }>}
 */
function runWithLimits(command, args, options = {}) {
  const timeoutMs = Math.max(500, options.timeoutMs || 10000);
  const maxOut = Math.max(4096, options.maxOutputBytes || 65536);
  const cwd = options.cwd;
  const env = options.env || process.env;
  const input = options.input;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let totalLen = 0;
    let outputTruncated = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    const killChild = (child) => {
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

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      finish({
        exitCode: null,
        stdout: '',
        stderr: err.message || String(err),
        timedOut: false,
        outputTruncated: false,
        errorMessage: err.message,
      });
      return;
    }

    const timer = setTimeout(() => {
      killChild(child);
      finish({
        exitCode: null,
        stdout: stdout.slice(0, maxOut),
        stderr: `${stderr}\n（已超时终止）`.trim(),
        timedOut: true,
        outputTruncated,
      });
    }, timeoutMs);

    const onChunk = (which, chunk) => {
      if (settled) return;
      const s = chunk.toString();
      totalLen += Buffer.byteLength(s, 'utf8');
      if (totalLen > maxOut) {
        outputTruncated = true;
        killChild(child);
        finish({
          exitCode: null,
          stdout: stdout.slice(0, maxOut),
          stderr: `${stderr}\n（输出过长已终止）`.trim(),
          timedOut: false,
          outputTruncated: true,
        });
        return;
      }
      if (which === 'out') stdout += s;
      else stderr += s;
    };

    if (input != null) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.stdout.on('data', (d) => onChunk('out', d));
    child.stderr.on('data', (d) => onChunk('err', d));

    child.on('error', (err) => {
      finish({
        exitCode: null,
        stdout: stdout.slice(0, maxOut),
        stderr: err.message || String(err),
        timedOut: false,
        outputTruncated,
        errorMessage: err.message,
      });
    });

    child.on('close', (code) => {
      finish({
        exitCode: code,
        stdout: stdout.slice(0, maxOut),
        stderr: stderr.slice(0, maxOut),
        timedOut: false,
        outputTruncated,
      });
    });
  });
}

module.exports = { runWithLimits };

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(__dirname, 'public');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicPath));

const languageConfig = {
  javascript: {
    display: 'JavaScript',
    run: async (code) => runWithStdin('node', ['-'], code)
  },
  python: {
    display: 'Python',
    run: async (code) => runWithStdin('python', ['-u'], code).catch(async () => runWithStdin('python3', ['-u'], code))
  },
  c: {
    display: 'C',
    run: async (code) => compileAndRun(code, 'c', ['gcc'], ['gcc', '-std=c17', '-O2', '-o'], './prog_c')
  },
  cpp: {
    display: 'C++',
    run: async (code) => compileAndRun(code, 'cpp', ['g++'], ['g++', '-std=c++20', '-O2', '-o'], './prog_cpp')
  }
};

app.post('/run', async (req, res) => {
  const { language, code } = req.body || {};
  if (!language || !code || !languageConfig[language]) {
    return res.status(400).json({ error: 'Invalid request: provide language and code.' });
  }

  try {
    const result = await languageConfig[language].run(code);
    res.json(result);
  } catch (error) {
    res.json({ stdout: '', stderr: error.message || String(error), exitCode: 1, timedOut: false });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(PORT, () => {
  console.log(`Mini code compiler running at http://localhost:${PORT}`);
});

async function runWithStdin(command, args, code) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, 5000);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start ${command}. Make sure it is installed and on PATH.`));
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    proc.stdin.write(code);
    proc.stdin.end();
  });
}

async function compileAndRun(code, ext, compilerNames, compileArgs, runCommand) {
  const id = randomUUID();
  const tempDir = path.join(os.tmpdir(), `mini-code-runner-${id}`);
  await fs.mkdir(tempDir, { recursive: true });

  const sourcePath = path.join(tempDir, `Main.${ext}`);
  const outputBinary = path.join(tempDir, ext === 'c' ? 'prog_c.exe' : 'prog_cpp.exe');

  await fs.writeFile(sourcePath, code, 'utf8');

  return new Promise((resolve, reject) => {
    const compile = spawn(compileArgs[0], [...compileArgs.slice(1), sourcePath, '-o', outputBinary], { cwd: tempDir });
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      compile.kill('SIGKILL');
    }, 8000);

    compile.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    compile.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    compile.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Compiler not found. Install ${compilerNames.join(' or ')} and ensure it is on PATH.`));
    });
    compile.on('close', async (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        await cleanup(tempDir);
        return resolve({ stdout, stderr: stderr || 'Compilation failed.', exitCode: code, timedOut });
      }

      try {
        const runResult = await runWithStdin(outputBinary, [], '');
        await cleanup(tempDir);
        resolve(runResult);
      } catch (execError) {
        await cleanup(tempDir);
        reject(execError);
      }
    });
  });
}

async function cleanup(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // ignore cleanup failures
  }
}

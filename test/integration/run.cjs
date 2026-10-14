// 在真实 VS Code 里跑集成测试:下载/复用 VS Code,加载本扩展,执行 suite。
// 用法:npm run test:integration(CI 里用 xvfb-run -a 提供显示器)
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const { downloadAndUnzipVSCode, runTests } = require('@vscode/test-electron')

/**
 * VS Code 1.14x 起 macOS 的可执行文件叫 Code,而 @vscode/test-electron 仍返回 .../MacOS/Electron。
 * 这里在文件不存在时自动改用同目录下的 Code。
 */
function fixDarwinExecutable(executablePath) {
  if (process.platform !== 'darwin' || !executablePath.endsWith('/Electron'))
    return executablePath
  const alternative = executablePath.replace(/\/Electron$/, '/Code')
  return fs.existsSync(alternative) ? alternative : executablePath
}

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..')
  const extensionTestsPath = path.resolve(__dirname, 'suite.cjs')
  // 用户数据目录放到临时位置,避免污染本机配置
  const userDataDir = path.resolve(extensionDevelopmentPath, 'test/.tmp/vscode-user-data')
  // 独立的工作区目录:批量格式化只应影响这里,绝不碰仓库里的示例文件
  const workspaceDir = path.resolve(extensionDevelopmentPath, 'test/.tmp/it-workspace')
  fs.rmSync(workspaceDir, { recursive: true, force: true })
  fs.mkdirSync(workspaceDir, { recursive: true })
  try {
    // 下载 VS Code 的默认超时是 15s,国内网络下经常不够;放宽到 10 分钟
    const downloaded = await downloadAndUnzipVSCode({ timeout: 600000 })
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // 已装好的 VS Code 可直接复用:VSCODE_EXECUTABLE_PATH=/path/to/Code
      vscodeExecutablePath: fixDarwinExecutable(process.env.VSCODE_EXECUTABLE_PATH || downloaded),
      launchArgs: [
        workspaceDir,
        '--disable-gpu',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        `--user-data-dir=${userDataDir}`,
      ],
    })
  }
  catch (error) {
    console.error('集成测试失败:', error)
    process.exit(1)
  }
}

void main()

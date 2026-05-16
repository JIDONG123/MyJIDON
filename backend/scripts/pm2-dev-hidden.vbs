' 无控制台窗口启动开发 PM2（可选）：双击或在资源管理器中运行
' 不用 cmd /c，避免闪黑窗；日志: pm2 logs smart-grading-api
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
backendDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = fso.GetParentFolderName(backendDir)
sh.CurrentDirectory = backendDir
sh.Run "node scripts\pm2-restart-dev.cjs", 0, False

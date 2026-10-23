' Job Pilot launcher (no console window).
'   launch.vbs        start the app, or open it if it's already running (the desktop shortcut)
'   launch.vbs run    the daily run (used by the Windows scheduled task)
'   launch.vbs server start the server without opening a browser (Startup folder, when phone access is on)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
If Not fso.FolderExists(dir & "\data\runs") Then
  If Not fso.FolderExists(dir & "\data") Then fso.CreateFolder(dir & "\data")
  fso.CreateFolder(dir & "\data\runs")
End If

mode = ""
If WScript.Arguments.Count > 0 Then mode = WScript.Arguments(0)

If mode = "run" Then
  sh.Run "cmd /c node """ & dir & "\apply.mjs"" run >> """ & dir & "\data\runs\scheduled.log"" 2>&1", 0, False
ElseIf mode = "server" Then
  sh.Run "cmd /c node """ & dir & "\server.mjs"" --no-open >> """ & dir & "\data\runs\server.log"" 2>&1", 0, False
Else
  ' server.mjs opens the browser itself, and just opens it if an instance is already running
  sh.Run "cmd /c node """ & dir & "\server.mjs"" >> """ & dir & "\data\runs\server.log"" 2>&1", 0, False
End If

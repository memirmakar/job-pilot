' Job Pilot launcher (no console window).
'   launch.vbs        start the app if needed, then open its page in front (the desktop shortcut)
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
  ' The shortcut: start the server unless it's already running, then open the page from here. This script is what you
  ' clicked, so Windows lets the browser come to the front (a page opened by the hidden server often stays behind).
  port = sh.ExpandEnvironmentStrings("%PORT%")
  If port = "%PORT%" Then port = "4510"
  url = "http://127.0.0.1:" & port
  If Not IsUp(url) Then
    sh.Run "cmd /c node """ & dir & "\server.mjs"" --no-open >> """ & dir & "\data\runs\server.log"" 2>&1", 0, False
    For i = 1 To 60
      WScript.Sleep 250
      If IsUp(url) Then Exit For
    Next
  End If
  If IsUp(url) Then
    sh.Run url
  Else
    MsgBox "Job Pilot didn't start. The reason is at the end of this file:" & vbCrLf & dir & "\data\runs\server.log", vbExclamation, "Job Pilot"
  End If
End If

' True when Job Pilot's server answers at url
Function IsUp(url)
  On Error Resume Next
  Dim x
  Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  x.setTimeouts 1000, 1000, 1000, 1000
  x.Open "GET", url & "/api/meta", False
  x.Send
  IsUp = (Err.Number = 0)
  If IsUp Then IsUp = (x.Status = 200)
  Err.Clear
End Function

Option Explicit

Dim shell, fso, projectDir, nodePath, launcherPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = fso.BuildPath(projectDir, "vendor\node\node.exe")
launcherPath = fso.BuildPath(projectDir, "scripts\launch-app.js")
shell.CurrentDirectory = projectDir

If Not fso.FileExists(nodePath) Or Not fso.FileExists(launcherPath) Then
  MsgBox "Anime Search portable package is incomplete.", vbCritical, "Anime Search"
  WScript.Quit 1
End If

command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & launcherPath & Chr(34)
shell.Run command, 0, False

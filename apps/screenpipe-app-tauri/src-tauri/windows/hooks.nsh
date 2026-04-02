!macro NSIS_HOOK_PREINSTALL
  ; Kill thadm processes before installation
  nsExec::ExecToLog 'taskkill /F /IM thadm.exe'
  nsExec::ExecToLog 'taskkill /F /IM thadm-app.exe'
  ; Wait a moment for processes to fully terminate and release file handles
  Sleep 1000
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up runtime-downloaded PortableGit (bash for AI chat)
  RMDir /r "$LOCALAPPDATA\thadm\git-portable"
  ; Remove parent dir only if empty (preserves other thadm data)
  RMDir "$LOCALAPPDATA\thadm"
!macroend

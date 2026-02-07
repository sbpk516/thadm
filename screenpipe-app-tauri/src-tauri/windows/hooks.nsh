!macro NSIS_HOOK_PREINSTALL
  ; Kill thadm processes before installation
  nsExec::ExecToLog 'taskkill /F /IM thadm-recorder.exe'
  nsExec::ExecToLog 'taskkill /F /IM thadm.exe'
  ; Wait a moment for processes to fully terminate and release file handles
  Sleep 1000
!macroend

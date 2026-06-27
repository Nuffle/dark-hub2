!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Encerrando motor do Dark Hub se estiver em execucao..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM motor.exe'
!macroend

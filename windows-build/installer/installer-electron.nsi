; =============================================================================
; Diagnostic ERP Desktop — NSIS wrapper for the Electron build
;
; electron-builder's NSIS step exceeds our cross-build sandbox time budget on
; a 384 MB payload — the lzma 7z step alone runs past 2 minutes. So we let
; electron-builder produce just the unpacked Windows app (`win-unpacked/`),
; zip it ourselves, and embed the zip in a custom NSIS installer that
; expands it with PowerShell on the user's machine. Same trick as the
; portable launcher's installer.nsi.
;
; Built on Linux with:
;   makensis -DPAYLOAD_ZIP=...DiagnosticERP-Desktop-win-unpacked.zip \
;            -DOUT_FILE=...DiagnosticERP-Desktop-Setup.exe installer-electron.nsi
; =============================================================================

!ifndef PAYLOAD_ZIP
  !error "PAYLOAD_ZIP must be defined: -DPAYLOAD_ZIP=path\\to\\DiagnosticERP-Desktop-win-unpacked.zip"
!endif
!ifndef OUT_FILE
  !error "OUT_FILE must be defined: -DOUT_FILE=DiagnoCenter-Desktop-Setup.exe"
!endif

!define APP_NAME      "Care Diagnostics Desktop"
!define APP_SHORT     "CareDiagnosticsDesktop"
!define APP_PUBLISHER "Care Diagnostics"
!define APP_VERSION   "1.0.0"
!define EXE_NAME      "DiagnoCenter.exe"
!define UNINST_KEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_SHORT}"

SetCompress off
Unicode true
RequestExecutionLevel admin
Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$PROGRAMFILES64\${APP_SHORT}"
InstallDirRegKey HKLM "Software\${APP_SHORT}" "InstallDir"
ShowInstDetails show
ShowUninstDetails show

!include "MUI2.nsh"
!include "FileFunc.nsh"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE_NAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME} now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Var DeleteDataCheckbox
Var DeleteData

Section "Install"
  SetOutPath "$INSTDIR"

  File "/oname=payload.zip" "${PAYLOAD_ZIP}"

  ; Same PowerShell extractor trick as the portable installer.
  ; All PowerShell variables are escaped $$ because NSIS treats $foo as a var.
  FileOpen $0 "$INSTDIR\extract-payload.ps1" w
  FileWrite $0 '$$ErrorActionPreference = "Stop"$\r$\n'
  FileWrite $0 '$$installDir = $$args[0]$\r$\n'
  FileWrite $0 '$$zip = Join-Path $$installDir "payload.zip"$\r$\n'
  FileWrite $0 '$$tmp = Join-Path $$installDir "_extract"$\r$\n'
  FileWrite $0 'if (Test-Path $$tmp) { Remove-Item $$tmp -Recurse -Force }$\r$\n'
  FileWrite $0 'New-Item -ItemType Directory -Path $$tmp | Out-Null$\r$\n'
  FileWrite $0 'Expand-Archive -LiteralPath $$zip -DestinationPath $$tmp -Force$\r$\n'
  FileWrite $0 '# Zip wraps everything in a top-level "win-unpacked" folder; flatten it.$\r$\n'
  FileWrite $0 '$$root = Get-ChildItem $$tmp | Select-Object -First 1$\r$\n'
  FileWrite $0 'Get-ChildItem -LiteralPath $$root.FullName -Force | ForEach-Object {$\r$\n'
  FileWrite $0 '  Move-Item -LiteralPath $$_.FullName -Destination $$installDir -Force$\r$\n'
  FileWrite $0 '}$\r$\n'
  FileWrite $0 'Remove-Item $$tmp -Recurse -Force$\r$\n'
  FileWrite $0 'Remove-Item $$zip -Force$\r$\n'
  FileClose $0

  DetailPrint "Extracting application files (this can take a minute)…"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\extract-payload.ps1" "$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Extraction failed (exit $0). Open extract-payload.ps1 in $INSTDIR for details."
    Abort
  ${EndIf}
  Delete "$INSTDIR\extract-payload.ps1"

  IfFileExists "$INSTDIR\${EXE_NAME}" +3 0
    MessageBox MB_ICONSTOP "Installation appears incomplete: ${EXE_NAME} is missing from $INSTDIR."
    Abort

  ; Sentinel marker for the uninstaller — see installer.nsi rationale.
  FileOpen $0 "$INSTDIR\.diagnostic-erp-desktop-install" w
  FileWrite $0 "${APP_VERSION}"
  FileClose $0

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${EXE_NAME}" "" "$INSTDIR\${EXE_NAME}" 0
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"   "$INSTDIR\Uninstall.exe"
  CreateShortCut  "$DESKTOP\${APP_NAME}.lnk"                "$INSTDIR\${EXE_NAME}" "" "$INSTDIR\${EXE_NAME}" 0

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr   HKLM "${UNINST_KEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\${EXE_NAME}"
  WriteRegStr   HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize"   "$0"
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify"        1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair"        1
  WriteRegStr   HKLM "Software\${APP_SHORT}" "InstallDir" "$INSTDIR"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Function un.onInit
  StrCpy $DeleteData "0"
FunctionEnd

UninstPage custom un.dataPage un.dataPageLeave

Function un.dataPage
  !insertmacro MUI_HEADER_TEXT "Application data" "Decide what to do with your patient data."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 40u "${APP_NAME} stores its database under your user profile (%APPDATA%\Diagnostic ERP Desktop\diagnostic-erp\). It is NOT removed by this uninstaller. Tick the box below if you really want to delete the per-user data inside this install folder too."
  Pop $0
  ${NSD_CreateCheckbox} 0 50u 100% 12u "Delete the install-folder data subdirectory (cannot be undone)"
  Pop $DeleteDataCheckbox
  nsDialogs::Show
FunctionEnd

Function un.dataPageLeave
  ${NSD_GetState} $DeleteDataCheckbox $DeleteData
FunctionEnd

Section "Uninstall"
  IfFileExists "$INSTDIR\.diagnostic-erp-desktop-install" +3 0
    MessageBox MB_ICONSTOP "Refusing to uninstall: $INSTDIR doesn't look like a Diagnostic ERP Desktop install (missing .diagnostic-erp-desktop-install marker). Delete it manually if you really want to."
    Abort

  nsExec::ExecToLog 'taskkill /F /IM "${EXE_NAME}"'
  Pop $0
  Sleep 500

  ; Try a graceful Postgres shutdown before deleting the runtime. The
  ; Electron app stores its DB cluster under %APPDATA% by default, but if
  ; the user pointed it at the install dir we still want to be careful.
  IfFileExists "$INSTDIR\resources\payload\runtime\pgsql\bin\pg_ctl.exe" 0 +3
    nsExec::ExecToLog '"$INSTDIR\resources\payload\runtime\pgsql\bin\pg_ctl.exe" -D "$INSTDIR\data\pgsql" stop -m fast -w -t 20'
    Pop $0

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete   "$INSTDIR\*.dll"
  Delete   "$INSTDIR\*.pak"
  Delete   "$INSTDIR\*.bin"
  Delete   "$INSTDIR\*.json"
  Delete   "$INSTDIR\*.html"
  Delete   "$INSTDIR\*.txt"
  Delete   "$INSTDIR\*.dat"
  Delete   "$INSTDIR\${EXE_NAME}"
  Delete   "$INSTDIR\.diagnostic-erp-desktop-install"
  Delete   "$INSTDIR\Uninstall.exe"

  ${If} $DeleteData == ${BST_CHECKED}
    RMDir /r "$INSTDIR\data"
  ${EndIf}

  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\${APP_SHORT}"
SectionEnd

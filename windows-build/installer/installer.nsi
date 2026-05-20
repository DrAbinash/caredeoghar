; =============================================================================
; Diagnostic Center Billing ERP — Windows installer (NSIS)
;
; Built on Linux with:
;   makensis -DPAYLOAD_ZIP=...DiagnosticERP-Portable.zip \
;            -DOUT_FILE=...DiagnosticERP-Setup.exe installer.nsi
;
; Strategy:
;   The portable folder contains ~5000 files (mostly bundled node_modules).
;   Asking NSIS to File-list each one pushes the build past the sandbox's
;   command timeout, even with SetCompress off. Instead we embed the
;   already-built portable .zip as a single File and let PowerShell extract
;   it on the user's machine at install time. PowerShell 5.0 / Expand-Archive
;   is built into Windows 10 and Windows 11 — our minimum supported Windows
;   versions.
;
; Result:
;   - Linux build of the installer takes ~5 seconds.
;   - Installer is ~265 MB (same size as the .zip plus tiny NSIS overhead).
;   - Install on Windows takes ~30-60 s (Expand-Archive + move).
; =============================================================================

!ifndef PAYLOAD_ZIP
  !error "PAYLOAD_ZIP must be defined: -DPAYLOAD_ZIP=path\\to\\DiagnosticERP-Portable.zip"
!endif
!ifndef OUT_FILE
  !error "OUT_FILE must be defined: -DOUT_FILE=DiagnosticERP-Setup.exe"
!endif

!define APP_NAME      "Care Diagnostics"
!define APP_SHORT     "CareDiagnostics"
!define APP_PUBLISHER "Care Diagnostics"
!define APP_VERSION   "1.0.0"
!define EXE_NAME      "DiagnoCenter.exe"
!define UNINST_KEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_SHORT}"

; The .zip we embed is itself deflate-compressed already; running NSIS LZMA on
; top buys very little and adds many minutes to the build. Off = pass-through.
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

; ============================================================================
Section "Install"
  SetOutPath "$INSTDIR"

  ; Drop the portable .zip + a tiny extractor script in $INSTDIR.
  File "/oname=payload.zip" "${PAYLOAD_ZIP}"

  ; Write a PS1 helper instead of cramming a one-liner into ExecWait — easier
  ; for users to inspect / re-run if extraction ever fails.
  ;
  ; NB: NSIS treats $foo as a variable reference, so every PowerShell variable
  ; below is escaped as $$ in the .nsi source. The $\r$\n at end-of-line is a
  ; real NSIS escape and stays as-is.
  FileOpen $0 "$INSTDIR\extract-payload.ps1" w
  FileWrite $0 '$$ErrorActionPreference = "Stop"$\r$\n'
  FileWrite $0 '$$installDir = $$args[0]$\r$\n'
  FileWrite $0 '$$zip = Join-Path $$installDir "payload.zip"$\r$\n'
  FileWrite $0 '$$tmp = Join-Path $$installDir "_extract"$\r$\n'
  FileWrite $0 'if (Test-Path $$tmp) { Remove-Item $$tmp -Recurse -Force }$\r$\n'
  FileWrite $0 'New-Item -ItemType Directory -Path $$tmp | Out-Null$\r$\n'
  FileWrite $0 'Expand-Archive -LiteralPath $$zip -DestinationPath $$tmp -Force$\r$\n'
  FileWrite $0 '# Zip wraps everything in a top-level "DiagnoCenter" folder; flatten it.$\r$\n'
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

  ; Sanity-check that the launcher landed where we expect.
  IfFileExists "$INSTDIR\${EXE_NAME}" +3 0
    MessageBox MB_ICONSTOP "Installation appears incomplete: ${EXE_NAME} is missing from $INSTDIR."
    Abort

  ; Sentinel marker — the uninstaller refuses to RMDir /r unless this file is
  ; present. Keeps a misconfigured $INSTDIR (somehow pointed at C:\ or a user's
  ; Documents folder) from being recursively wiped.
  FileOpen $0 "$INSTDIR\.diagnostic-erp-install" w
  FileWrite $0 "${APP_VERSION}"
  FileClose $0

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${EXE_NAME}" "" "$INSTDIR\${EXE_NAME}" 0
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"   "$INSTDIR\Uninstall.exe"
  CreateShortCut  "$DESKTOP\${APP_NAME}.lnk"                "$INSTDIR\${EXE_NAME}" "" "$INSTDIR\${EXE_NAME}" 0

  ; Add/Remove Programs entry (with on-disk size so Windows displays it).
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

; ============================================================================
; Uninstall
; ============================================================================
Function un.onInit
  StrCpy $DeleteData "0"
FunctionEnd

UninstPage custom un.dataPage un.dataPageLeave

Function un.dataPage
  !insertmacro MUI_HEADER_TEXT "Database files" "Decide what to do with the patient data."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 40u "Your patient records, billing entries, and Postgres database files live in:$\r$\n$\r$\n    $INSTDIR\data$\r$\n$\r$\nLeave the box unchecked to keep them. This is recommended unless you really want to wipe everything."
  Pop $0
  ${NSD_CreateCheckbox} 0 50u 100% 12u "Delete the data folder too (cannot be undone)"
  Pop $DeleteDataCheckbox
  nsDialogs::Show
FunctionEnd

Function un.dataPageLeave
  ${NSD_GetState} $DeleteDataCheckbox $DeleteData
FunctionEnd

Section "Uninstall"
  ; Refuse to operate unless our sentinel marker is present. Stops a
  ; misconfigured $INSTDIR from being recursively wiped if the registry
  ; somehow points us at the wrong place.
  IfFileExists "$INSTDIR\.diagnostic-erp-install" +3 0
    MessageBox MB_ICONSTOP "Refusing to uninstall: $INSTDIR doesn't look like a Diagnostic ERP install (missing .diagnostic-erp-install marker). Delete it manually if you really want to."
    Abort

  ; Stop any running instance first so files aren't locked.
  nsExec::ExecToLog 'taskkill /F /IM ${EXE_NAME}'
  Pop $0
  Sleep 500

  ; Give Postgres a chance to shut down cleanly before we delete its binaries.
  ; The launcher's taskkill above force-terminates DiagnosticERP.exe, which
  ; can leave the Postgres child running with an open data directory. If pg
  ; isn't running this just exits with "PID file does not exist" — fine.
  IfFileExists "$INSTDIR\runtime\pgsql\bin\pg_ctl.exe" 0 +3
    nsExec::ExecToLog '"$INSTDIR\runtime\pgsql\bin\pg_ctl.exe" -D "$INSTDIR\data\pgsql" stop -m fast -w -t 20'
    Pop $0

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete   "$INSTDIR\${EXE_NAME}"
  Delete   "$INSTDIR\MANIFEST.json"
  Delete   "$INSTDIR\.diagnostic-erp-install"
  Delete   "$INSTDIR\Uninstall.exe"

  ${If} $DeleteData == ${BST_CHECKED}
    RMDir /r "$INSTDIR\data"
    RMDir /r "$INSTDIR\logs"
  ${EndIf}

  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\${APP_SHORT}"
SectionEnd

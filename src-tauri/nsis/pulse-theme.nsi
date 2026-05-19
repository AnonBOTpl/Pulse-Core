; PulseCore Cyberpunk NSIS Theme
; Dark mode installer — black bg, cyan accents

; ── MUI / colour overrides (must precede MUI2.nsh) ──

!define MUI_BGCOLOR 000000
!define MUI_TEXTCOLOR CCFFFF
!define MUI_INSTFILESPAGE_COLORS "CCFFFF 000000"

; ── Header / sidebar bitmaps ──

!define MUI_HEADERIMAGE
; 4 poziomy w górę: z x64 -> nsis -> release -> target -> src-tauri
!define MUI_HEADERIMAGE_BITMAP "..\..\..\..\nsis\header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "..\..\..\..\nsis\installer.bmp"

; ── Welcome / finish page text colours ──

!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TITLE_3LINES

; ── Includes ──

!include "MUI2.nsh"

; ── Pages ──

!insertmacro MUI_PAGE_WELCOME
; 5 poziomów w górę: aż do głównego folderu Pulse-Core po plik LICENSE
!insertmacro MUI_PAGE_LICENSE "..\..\..\..\..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; ── Language ──

!insertmacro MUI_LANGUAGE "Polish"
!insertmacro MUI_LANGUAGE "English"

; ── Callback: recolour progress bar to cyan ──

Function .onInit
  ; Inicjalizacja wewnętrzna Tauri
  ${TauriInit}
FunctionEnd

; ── Instfiles page: override progress bar colour ──

Function instfilesPre
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1036
  SetCtlColors $1 00FFFF 000000
  GetDlgItem $2 $0 1028
  SetCtlColors $2 CCFFFF 000000
FunctionEnd

!insertmacro MUI_INSTFILESPAGE_INIT_CALL instfilesPre

; ── Install section ──

Section "PulseCore" main_section
  ${TauriMain}
SectionEnd
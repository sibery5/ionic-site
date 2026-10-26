; Kurulum/kaldırma sırasında oyun açıksa "başka bir program kullanıyor" hatası yerine oyunu kapat
; (1.0.0 sürümündeki eski exe adı da kapatılır)
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "Istanbul Mafya.exe"'
  Pop $0
  Sleep 1200
!macroend

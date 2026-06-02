Set ws = CreateObject("WScript.Shell")

' ローカルにビルドされた単一のindex.htmlのパス
htmlPath = "C:\Users\MyPC\.gemini\antigravity\scratch\pdf-tools\dist\index.html"

' Edgeをアプリモードで起動（URLバーのない独立ウィンドウ）
' エラーハンドリングを入れておく
On Error Resume Next
' URLとして認識させるため file:/// スキームを使う
ws.Run "msedge --app=""file:///" & Replace(htmlPath, "\", "/") & """", 1, False

If Err.Number <> 0 Then
    ' Edgeが起動できない場合はデフォルトブラウザで通常のウィンドウとして開く
    ws.Run """" & htmlPath & """"
End If
On Error GoTo 0

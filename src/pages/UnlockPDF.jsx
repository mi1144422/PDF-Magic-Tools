import React, { useState } from 'react';
import DragDropZone from '../components/DragDropZone';
import { downloadPdf } from '../utils/pdfProcessor';
import { decryptPDF, isEncrypted } from '@pdfsmaller/pdf-decrypt';
import {
  Unlock, Eye, EyeOff, ShieldAlert, FileText,
  Trash2, Download, Info, CheckCircle2
} from 'lucide-react';
import './UnlockPDF.css';

export default function UnlockPDF() {
  const [files, setFiles] = useState([]);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [isDone, setIsDone] = useState(false);

  // ファイル選択ハンドラ
  const handleFilesSelected = (selectedFiles) => {
    setFiles((prev) => [...prev, ...selectedFiles]);
    setIsDone(false);
  };

  // ファイル削除
  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
    setIsDone(false);
  };

  // パスワード解除処理
  const handleUnlock = async () => {
    if (!password) {
      alert('パスワードを入力してください。');
      return;
    }
    if (files.length === 0) {
      alert('PDFファイルを選択してください。');
      return;
    }

    setIsProcessing(true);
    setProcessedCount(0);
    setIsDone(false);

    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfBytes = new Uint8Array(arrayBuffer);

        // 暗号化されているかチェック
        const info = await isEncrypted(pdfBytes);
        if (!info.encrypted) {
          alert(`「${file.name}」は暗号化されていません。パスワード解除の必要はありません。`);
          continue;
        }

        // 復号化
        const decryptedBytes = await decryptPDF(pdfBytes, password);

        // ダウンロード
        const baseName = file.name.replace(/\.pdf$/i, '');
        downloadPdf(decryptedBytes, `${baseName}_unlocked.pdf`);
        successCount++;
      } catch (error) {
        console.error('解除中にエラーが発生しました:', error);
        const msg = error.message || '';
        if (msg === 'Incorrect password' || msg.includes('Incorrect password')) {
          alert(`「${file.name}」のパスワードが間違っています。正しいパスワードを入力してください。`);
        } else if (msg.includes('not encrypted') || msg === 'This PDF is not encrypted') {
          alert(`「${file.name}」は暗号化されていません。`);
        } else if (msg.includes('Unsupported encryption')) {
          alert(`「${file.name}」は対応していない暗号化方式が使われています（AES-128等）。`);
        } else {
          alert(`「${file.name}」の解除中にエラーが発生しました。ファイルが破損している可能性があります。`);
        }
      } finally {
        setProcessedCount(i + 1);
      }
    }
    
    if (successCount > 0) {
        setIsDone(true);
    }
    setIsProcessing(false);
  };

  // リセット
  const handleReset = () => {
    setFiles([]);
    setPassword('');
    setIsDone(false);
    setProcessedCount(0);
  };

  return (
    <div className="unlock-container">
      <div className="page-header">
        <h1>PDFパスワード解除</h1>
        <p>パスワードで保護されたPDFファイルのロックを解除し、パスワードなしのPDFとして保存します。</p>
      </div>

      <div className="layout-grid">
        {/* ファイルアップロードエリア */}
        <div className="upload-section">
          <DragDropZone onFilesSelected={handleFilesSelected} multiple={true} />
        </div>

        {/* メイン設定エリア */}
        <div className="unlock-workspace glass-panel">
          <div className="unlock-content">
            {/* 左側: パスワード入力 */}
            <div className="password-section">
              <div className="section-title">
                <Unlock size={20} />
                <h3>パスワード入力</h3>
              </div>

              <div className="password-field">
                <label htmlFor="unlock-password">
                  現在のパスワード <span className="required">*必須</span>
                </label>
                <p className="field-hint">
                  対象のPDFを開くために必要なパスワードを入力してください。
                </p>
                <div className="password-input-wrapper">
                  <input
                    id="unlock-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="パスワードを入力"
                    autoComplete="new-password"
                  />
                  <button
                    className="toggle-visibility"
                    onClick={() => setShowPw(!showPw)}
                    type="button"
                    title={showPw ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {/* 右側: ファイルリスト + アクション */}
            <div className="files-action-section">
              {files.length > 0 ? (
                <>
                  <div className="section-title">
                    <FileText size={20} />
                    <h3>選択されたファイル ({files.length})</h3>
                  </div>
                  <div className="file-list">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="file-item">
                        <FileText size={16} className="file-item-icon" />
                        <span className="file-item-name" title={file.name}>
                          {file.name.length > 30
                            ? file.name.substring(0, 30) + '...'
                            : file.name}
                        </span>
                        <span className="file-item-size">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          className="file-item-delete"
                          onClick={() => removeFile(index)}
                          title="削除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="no-files-message">
                  <ShieldAlert size={48} />
                  <p>上のエリアからロック解除したいPDFを追加してください</p>
                </div>
              )}

              {/* 注意事項 */}
              <div className="unlock-notice">
                <Info size={16} />
                <span>パスワード解除には正しいパスワードが必要です。パスワードを解析・ハッキングする機能ではありません。</span>
              </div>

              {/* 進捗・完了 */}
              {isProcessing && (
                <div className="progress-bar-wrapper">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(processedCount / files.length) * 100}%` }}
                  />
                  <span className="progress-text">
                    {processedCount} / {files.length} ファイル処理中...
                  </span>
                </div>
              )}

              {isDone && (
                <div className="done-message">
                  <CheckCircle2 size={20} />
                  <span>パスワードの解除が完了しました！</span>
                </div>
              )}

              {/* アクションボタン */}
              <div className="unlock-actions">
                <button className="btn" onClick={handleReset}>
                  リセット
                </button>
                <button
                  className="btn btn-primary unlock-btn"
                  onClick={handleUnlock}
                  disabled={isProcessing || files.length === 0 || !password}
                >
                  <Unlock size={18} />
                  {isProcessing
                    ? '解除中...'
                    : `パスワードを解除して保存${files.length > 1 ? ` (${files.length}ファイル)` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

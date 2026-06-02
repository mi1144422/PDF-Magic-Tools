import React, { useState } from 'react';
import DragDropZone from '../components/DragDropZone';
import { downloadPdf } from '../utils/pdfProcessor';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';
import {
  Lock, Eye, EyeOff, ShieldCheck, FileText,
  Trash2, Download, AlertTriangle, CheckCircle2
} from 'lucide-react';
import './ProtectPDF.css';

export default function ProtectPDF() {
  const [files, setFiles] = useState([]);
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showUserPw, setShowUserPw] = useState(false);
  const [showOwnerPw, setShowOwnerPw] = useState(false);
  const [useOwnerPassword, setUseOwnerPassword] = useState(false);
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

  // パスワード強度の判定
  const getPasswordStrength = (pw) => {
    if (!pw) return { level: 0, label: '', color: '' };
    if (pw.length < 4) return { level: 1, label: '弱い', color: '#ef4444' };
    if (pw.length < 8) return { level: 2, label: '普通', color: '#f59e0b' };
    // 英数字記号が混ざっているか
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const hasSymbol = /[^A-Za-z0-9]/.test(pw);
    const variety = [hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
    if (pw.length >= 8 && variety >= 3) return { level: 4, label: '非常に強い', color: '#10b981' };
    if (pw.length >= 8) return { level: 3, label: '強い', color: '#22c55e' };
    return { level: 2, label: '普通', color: '#f59e0b' };
  };

  const strength = getPasswordStrength(userPassword);

  // パスワード保護処理
  const handleProtect = async () => {
    if (!userPassword) {
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

        // 生のバイト列をそのまま暗号化ライブラリに渡す
        // ※ pdf-libのload→saveを経由すると複雑なPDF（Excel由来等）の
        //    フォントやレイアウトが破壊される可能性があるため、直接渡す
        const pdfBytes = new Uint8Array(arrayBuffer);

        // 暗号化
        const ownerPw = useOwnerPassword && ownerPassword
          ? ownerPassword
          : userPassword; // オーナーパスワードが未設定ならユーザーパスワードと同じにする

        const encryptedBytes = await encryptPDF(pdfBytes, userPassword, ownerPw);

        // ダウンロード
        const baseName = file.name.replace(/\.pdf$/i, '');
        downloadPdf(encryptedBytes, `${baseName}_protected.pdf`);
        successCount++;
      } catch (error) {
        console.error(`「${file.name}」の暗号化中にエラーが発生しました:`, error);
        alert(`「${file.name}」の暗号化中にエラーが発生しました。このファイルをスキップします。`);
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
    setUserPassword('');
    setOwnerPassword('');
    setUseOwnerPassword(false);
    setIsDone(false);
    setProcessedCount(0);
  };

  return (
    <div className="protect-container">
      <div className="page-header">
        <h1>PDFパスワード保護</h1>
        <p>PDFファイルにパスワードをかけて、第三者による閲覧を防止します。</p>
      </div>

      <div className="layout-grid">
        {/* ファイルアップロードエリア */}
        <div className="upload-section">
          <DragDropZone onFilesSelected={handleFilesSelected} multiple={true} />
        </div>

        {/* メイン設定エリア */}
        <div className="protect-workspace glass-panel">
          <div className="protect-content">
            {/* 左側: パスワード設定 */}
            <div className="password-section">
              <div className="section-title">
                <Lock size={20} />
                <h3>パスワード設定</h3>
              </div>

              {/* ユーザーパスワード（必須） */}
              <div className="password-field">
                <label htmlFor="user-password">
                  閲覧パスワード <span className="required">*必須</span>
                </label>
                <p className="field-hint">
                  このパスワードを知っている人だけがPDFを開けます。
                </p>
                <div className="password-input-wrapper">
                  <input
                    id="user-password"
                    type={showUserPw ? 'text' : 'password'}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="パスワードを入力"
                    autoComplete="new-password"
                  />
                  <button
                    className="toggle-visibility"
                    onClick={() => setShowUserPw(!showUserPw)}
                    type="button"
                    title={showUserPw ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showUserPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {/* パスワード強度インジケーター */}
                {userPassword && (
                  <div className="strength-indicator">
                    <div className="strength-bars">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`strength-bar ${strength.level >= level ? 'active' : ''}`}
                          style={strength.level >= level ? { background: strength.color } : {}}
                        />
                      ))}
                    </div>
                    <span className="strength-label" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* オーナーパスワード（オプション） */}
              <div className="owner-password-toggle">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={useOwnerPassword}
                    onChange={(e) => setUseOwnerPassword(e.target.checked)}
                  />
                  <span>オーナーパスワードも設定する（上級者向け）</span>
                </label>
              </div>

              {useOwnerPassword && (
                <div className="password-field owner-field">
                  <label htmlFor="owner-password">
                    オーナーパスワード
                  </label>
                  <p className="field-hint">
                    印刷やコピーの権限を管理するための管理者用パスワードです。
                  </p>
                  <div className="password-input-wrapper">
                    <input
                      id="owner-password"
                      type={showOwnerPw ? 'text' : 'password'}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="オーナーパスワードを入力"
                      autoComplete="new-password"
                    />
                    <button
                      className="toggle-visibility"
                      onClick={() => setShowOwnerPw(!showOwnerPw)}
                      type="button"
                    >
                      {showOwnerPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}
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
                  <ShieldCheck size={48} />
                  <p>上のエリアからPDFファイルを追加してください</p>
                </div>
              )}

              {/* 注意事項 */}
              <div className="protect-notice">
                <AlertTriangle size={16} />
                <span>パスワードを忘れると、PDFを開けなくなります。安全な場所にメモしてください。</span>
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
                  <span>{processedCount} 個のPDFにパスワードを設定しました！</span>
                </div>
              )}

              {/* アクションボタン */}
              <div className="protect-actions">
                <button className="btn" onClick={handleReset}>
                  リセット
                </button>
                <button
                  className="btn btn-primary protect-btn"
                  onClick={handleProtect}
                  disabled={isProcessing || files.length === 0 || !userPassword}
                >
                  <Download size={18} />
                  {isProcessing
                    ? '暗号化中...'
                    : `パスワードをかけてダウンロード${files.length > 1 ? ` (${files.length}ファイル)` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import DragDropZone from '../components/DragDropZone';
import PdfThumbnail from '../components/PdfThumbnail';
import PreviewModal from '../components/PreviewModal';
import { splitPdf, splitPdfByInterval, downloadPdf } from '../utils/pdfProcessor';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { FileText, Scissors, Check, ZoomIn, CheckSquare, XSquare, Package } from 'lucide-react';
import './SplitPDF.css';

// タブの定義
const TABS = [
  { id: 'select', label: 'ページ選択' },
  { id: 'range', label: '範囲指定' },
  { id: 'fixed', label: '固定分割' },
];

/**
 * 範囲指定文字列をパースしてページ番号の配列を返すヘルパー関数
 * 例: "1-3, 5, 7-10" → [1, 2, 3, 5, 7, 8, 9, 10]
 * @param {string} rangeStr - 範囲指定文字列
 * @param {number} totalPages - 総ページ数（上限バリデーション用）
 * @returns {number[]} ページ番号の配列（ソート済み・重複なし）
 */
function parsePageRange(rangeStr, totalPages) {
  if (!rangeStr || !rangeStr.trim()) return [];

  const pages = new Set();
  // カンマまたは全角カンマで分割
  const parts = rangeStr.split(/[,、]/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // ハイフンまたは全角ハイフンで範囲を判定
    const rangeMatch = trimmed.match(/^(\d+)\s*[-ー–—]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (isNaN(start) || isNaN(end)) continue;
      const low = Math.max(1, Math.min(start, end));
      const high = Math.min(totalPages, Math.max(start, end));
      for (let i = low; i <= high; i++) {
        pages.add(i);
      }
    } else {
      // 単一ページ番号
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= totalPages) {
        pages.add(num);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

export default function SplitPDF() {
  const [file, setFile] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedPages, setSelectedPages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewPage, setPreviewPage] = useState(null);
  // タブ管理
  const [activeTab, setActiveTab] = useState('select');
  // 範囲指定モード用
  const [rangeInput, setRangeInput] = useState('');
  const [rangeError, setRangeError] = useState('');
  // 固定分割モード用
  const [splitInterval, setSplitInterval] = useState(1);

  const handleFileSelected = async (selectedFiles) => {
    const selectedFile = selectedFiles[0];
    setFile(selectedFile);
    
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const count = pdfDoc.getPageCount();
      setTotalPages(count);
      
      // デフォルトではすべてのページを選択状態にする
      const allPages = Array.from({ length: count }, (_, i) => i + 1);
      setSelectedPages(allPages);
    } catch (error) {
      console.error(error);
      alert("PDFファイルの読み込みに失敗しました。");
      setFile(null);
    }
  };

  const togglePageSelection = (pageNum) => {
    setSelectedPages(prev => {
      if (prev.includes(pageNum)) {
        return prev.filter(p => p !== pageNum);
      } else {
        return [...prev, pageNum];
      }
    });
  };

  // 全選択ハンドラ
  const handleSelectAll = () => {
    const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);
    setSelectedPages(allPages);
  };

  // 全解除ハンドラ
  const handleDeselectAll = () => {
    setSelectedPages([]);
  };

  // ページ選択モードの分割処理
  const handleSplit = async () => {
    if (!file) return;
    
    if (selectedPages.length === 0) {
      alert("少なくとも1ページは選択してください。");
      return;
    }

    setIsProcessing(true);
    try {
      const splitBytes = await splitPdf(file, selectedPages);
      downloadPdf(splitBytes, `extracted_${file.name}`);
    } catch (error) {
      console.error(error);
      alert("PDFの抽出中にエラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  };

  // 範囲指定モードの分割処理
  const handleRangeSplit = async () => {
    if (!file) return;

    const pages = parsePageRange(rangeInput, totalPages);
    if (pages.length === 0) {
      setRangeError('有効なページ範囲を入力してください。例: 1-3, 5, 7-10');
      return;
    }
    setRangeError('');

    setIsProcessing(true);
    try {
      const splitBytes = await splitPdf(file, pages);
      downloadPdf(splitBytes, `range_${file.name}`);
    } catch (error) {
      console.error(error);
      alert("PDFの抽出中にエラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  };

  // 固定分割モードの分割処理
  const handleFixedSplit = async () => {
    if (!file) return;

    const interval = parseInt(splitInterval, 10);
    if (isNaN(interval) || interval < 1) {
      alert('1以上の整数を入力してください。');
      return;
    }

    setIsProcessing(true);
    try {
      const parts = await splitPdfByInterval(file, interval);

      if (parts.length === 1) {
        // 1ファイルのみなら直接ダウンロード
        downloadPdf(parts[0].bytes, parts[0].name);
      } else {
        // 複数ファイルの場合はZIPにまとめてダウンロード
        const zip = new JSZip();
        for (const part of parts) {
          zip.file(part.name, part.bytes);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        const baseName = file.name.replace(/\.pdf$/i, '');
        a.download = `${baseName}_split.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error(error);
      alert("PDFの分割中にエラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  };

  // 固定分割の結果プレビュー情報を計算
  const getFixedSplitPreview = () => {
    const interval = parseInt(splitInterval, 10);
    if (isNaN(interval) || interval < 1 || totalPages === 0) return [];
    const groups = [];
    for (let start = 1; start <= totalPages; start += interval) {
      const end = Math.min(start + interval - 1, totalPages);
      groups.push({ start, end, count: end - start + 1 });
    }
    return groups;
  };

  // ファイルリセット
  const handleReset = () => {
    setFile(null);
    setTotalPages(0);
    setSelectedPages([]);
    setRangeInput('');
    setRangeError('');
    setSplitInterval(1);
    setActiveTab('select');
  };

  return (
    <div className="split-container">
      <div className="page-header">
        <h1>PDF分割（ページ抽出）</h1>
        <p>抽出したいページを視覚的に選択して、新しいPDFを作成します。</p>
      </div>

      <div className="layout-grid">
        {!file ? (
          <div className="upload-section">
            <DragDropZone onFilesSelected={handleFileSelected} multiple={false} />
          </div>
        ) : (
          <div className="split-workspace glass-panel">
            {/* ヘッダー：ファイル情報 + アクション */}
            <div className="split-header">
              <div className="selected-file-info">
                <FileText size={24} className="file-icon" />
                <span className="file-name">{file.name}</span>
                <span className="page-count">({totalPages} ページ)</span>
              </div>
              <div className="split-actions">
                <button 
                  className="btn"
                  onClick={handleReset}
                >
                  キャンセル
                </button>
              </div>
            </div>

            {/* タブ切り替え */}
            <div className="split-tabs">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`split-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ===== ページ選択モード ===== */}
            {activeTab === 'select' && (
              <>
                <div className="tab-toolbar">
                  <div className="toolbar-left">
                    <button className="btn btn-sm btn-outline" onClick={handleSelectAll}>
                      <CheckSquare size={16} />
                      すべて選択
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={handleDeselectAll}>
                      <XSquare size={16} />
                      すべて解除
                    </button>
                    <span className="selection-info">
                      {selectedPages.length} / {totalPages} ページ選択中
                    </span>
                  </div>
                  <button 
                    className="btn btn-primary split-btn" 
                    onClick={handleSplit}
                    disabled={isProcessing || selectedPages.length === 0}
                  >
                    <Scissors size={18} />
                    {isProcessing ? '処理中...' : '抽出して保存'}
                  </button>
                </div>

                <div className="pages-grid">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
                    const isSelected = selectedPages.includes(pageNum);
                    return (
                      <div 
                        key={pageNum}
                        className={`page-thumbnail-card ${isSelected ? 'selected' : ''}`}
                      >
                        <div className="page-check-indicator" onClick={() => togglePageSelection(pageNum)}>
                          <Check size={16} />
                        </div>
                        <button className="preview-btn" onClick={() => setPreviewPage(pageNum)} title="拡大プレビュー">
                          <ZoomIn size={18} />
                        </button>
                        <div className="thumbnail-wrapper" onClick={() => togglePageSelection(pageNum)}>
                          <PdfThumbnail file={file} pageNumber={pageNum} width={120} />
                        </div>
                        <div className="page-number-label">
                          Page {pageNum}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ===== 範囲指定モード ===== */}
            {activeTab === 'range' && (
              <div className="range-mode">
                <div className="range-description">
                  <p>抽出したいページの範囲をカンマ区切りで入力してください。</p>
                  <p className="range-hint">
                    例: <code>1-3, 5, 7-10</code>　（全{totalPages}ページ中）
                  </p>
                </div>
                <div className="range-input-group">
                  <input
                    type="text"
                    className="range-input"
                    placeholder="例: 1-3, 5, 7-10"
                    value={rangeInput}
                    onChange={(e) => {
                      setRangeInput(e.target.value);
                      setRangeError('');
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRangeSplit(); }}
                  />
                  <button
                    className="btn btn-primary split-btn"
                    onClick={handleRangeSplit}
                    disabled={isProcessing || !rangeInput.trim()}
                  >
                    <Scissors size={18} />
                    {isProcessing ? '処理中...' : '抽出して保存'}
                  </button>
                </div>
                {rangeError && <p className="range-error">{rangeError}</p>}
                {rangeInput.trim() && !rangeError && (
                  <div className="range-preview">
                    <span className="range-preview-label">対象ページ: </span>
                    <span className="range-preview-pages">
                      {parsePageRange(rangeInput, totalPages).join(', ') || '—'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ===== 固定分割モード ===== */}
            {activeTab === 'fixed' && (
              <div className="fixed-mode">
                <div className="fixed-description">
                  <p>PDFを指定ページ数ごとに自動分割し、ZIPファイルとしてダウンロードします。</p>
                </div>
                <div className="fixed-input-group">
                  <label className="fixed-label" htmlFor="split-interval">
                    分割単位（ページ数）:
                  </label>
                  <input
                    id="split-interval"
                    type="number"
                    className="fixed-input"
                    min="1"
                    max={totalPages}
                    value={splitInterval}
                    onChange={(e) => setSplitInterval(e.target.value)}
                  />
                  <button
                    className="btn btn-primary split-btn"
                    onClick={handleFixedSplit}
                    disabled={isProcessing || !splitInterval || parseInt(splitInterval, 10) < 1}
                  >
                    <Package size={18} />
                    {isProcessing ? '処理中...' : '分割してZIPダウンロード'}
                  </button>
                </div>
                {/* 分割プレビュー */}
                {(() => {
                  const groups = getFixedSplitPreview();
                  if (groups.length === 0) return null;
                  return (
                    <div className="fixed-preview">
                      <p className="fixed-preview-title">
                        分割プレビュー: {groups.length}個のPDFに分割されます
                      </p>
                      <div className="fixed-preview-chips">
                        {groups.map((g, idx) => (
                          <span key={idx} className="fixed-chip">
                            Part {idx + 1}: {g.start === g.end ? `${g.start}` : `${g.start}–${g.end}`}
                            <span className="chip-count">({g.count}p)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {previewPage && file && (
        <PreviewModal 
          file={file} 
          pageNumber={previewPage} 
          onClose={() => setPreviewPage(null)} 
        />
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import DragDropZone from '../components/DragDropZone';
import PdfThumbnail from '../components/PdfThumbnail';
import PreviewModal from '../components/PreviewModal';
import { mergePdfs, mergePages, mergePdfsWithRotation, downloadPdf } from '../utils/pdfProcessor';
import { Trash2, ArrowLeft, ArrowRight, ZoomIn, RotateCw, FileText, LayoutGrid } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import './MergePDF.css';

/**
 * PDFのページ数を取得するヘルパー関数
 * @param {File} file - PDFファイル
 * @returns {Promise<number>} ページ数
 */
async function getPdfPageCount(file) {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument(arrayBuffer).promise;
  return doc.numPages;
}

export default function MergePDF() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewPage, setPreviewPage] = useState(1);

  // 表示モード: 'file' = ファイル表示, 'page' = ページ表示
  const [viewMode, setViewMode] = useState('file');

  // ページ表示モード用: フラットなページリスト
  // 各要素: { id: string, file: File, pageNumber: number, fileName: string, rotation: number }
  const [pageItems, setPageItems] = useState([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  // ファイル表示モード用: 回転情報マップ { [fileIndex]: { [pageIndex]: degrees } }
  const [fileRotations, setFileRotations] = useState({});

  // ファイルが変更されたらページリストを再構築する
  useEffect(() => {
    if (viewMode === 'page' && files.length > 0) {
      buildPageItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, viewMode]);

  // ページアイテムの最新状態をrefで管理（useCallbackの循環依存を回避）
  const pageItemsRef = useRef(pageItems);
  pageItemsRef.current = pageItems;

  /**
   * 全ファイルの全ページをフラットなリストとして構築する
   */
  const buildPageItems = useCallback(async () => {
    setIsLoadingPages(true);
    try {
      const items = [];
      const currentPageItems = pageItemsRef.current;
      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        const pageCount = await getPdfPageCount(file);
        for (let pi = 1; pi <= pageCount; pi++) {
          // 既存のページアイテムの回転情報を引き継ぐ
          const existingItem = currentPageItems.find(
            (item) => item.file === file && item.pageNumber === pi
          );
          items.push({
            id: `${file.name}-${fi}-${pi}`,
            file,
            pageNumber: pi,
            fileName: file.name,
            rotation: existingItem ? existingItem.rotation : 0,
          });
        }
      }
      setPageItems(items);
    } catch (error) {
      console.error('ページリスト構築中にエラーが発生しました:', error);
    } finally {
      setIsLoadingPages(false);
    }
  }, [files]);

  // --- ファイル操作 ---
  const handleFilesSelected = (selectedFiles) => {
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
    // 回転情報も更新
    const newRotations = {};
    Object.keys(fileRotations).forEach((key) => {
      const k = parseInt(key);
      if (k < index) {
        newRotations[k] = fileRotations[k];
      } else if (k > index) {
        newRotations[k - 1] = fileRotations[k];
      }
    });
    setFileRotations(newRotations);
  };

  const moveFile = (index, direction) => {
    if (direction === 'left' && index > 0) {
      const newFiles = [...files];
      [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
      setFiles(newFiles);
      // 回転情報も入れ替え
      const newRotations = { ...fileRotations };
      const temp = newRotations[index];
      newRotations[index] = newRotations[index - 1];
      newRotations[index - 1] = temp;
      setFileRotations(newRotations);
    } else if (direction === 'right' && index < files.length - 1) {
      const newFiles = [...files];
      [newFiles[index + 1], newFiles[index]] = [newFiles[index], newFiles[index + 1]];
      setFiles(newFiles);
      const newRotations = { ...fileRotations };
      const temp = newRotations[index];
      newRotations[index] = newRotations[index + 1];
      newRotations[index + 1] = temp;
      setFileRotations(newRotations);
    }
  };

  // --- ファイル表示モードの回転 ---
  const rotateFile = (fileIndex) => {
    setFileRotations((prev) => {
      const updated = { ...prev };
      if (!updated[fileIndex]) {
        updated[fileIndex] = {};
      }
      // ファイル全体の全ページを一括回転（ファイルモードでは1ページ目のサムネのみ表示だが結合時に全ページに適用）
      // ここではファイル単位の回転として「全ページ同じ角度」にする
      // 現在の回転角度を取得（最初のページの回転角度を基準にする）
      const currentDeg = updated[fileIndex]['all'] || 0;
      const newDeg = (currentDeg + 90) % 360;
      updated[fileIndex] = { all: newDeg };
      return updated;
    });
  };

  /**
   * ファイルモード用: fileRotationsから mergePdfsWithRotation用のマップに変換
   * 'all' キーがあれば全ページに適用
   */
  const buildRotationMapForMerge = async () => {
    const rotationMap = {};
    for (let fi = 0; fi < files.length; fi++) {
      const fileRot = fileRotations[fi];
      if (fileRot && fileRot.all && fileRot.all !== 0) {
        const pageCount = await getPdfPageCount(files[fi]);
        rotationMap[fi] = {};
        for (let pi = 0; pi < pageCount; pi++) {
          rotationMap[fi][pi] = fileRot.all;
        }
      }
    }
    return rotationMap;
  };

  // --- ページ表示モードの操作 ---
  const removePage = (index) => {
    setPageItems(pageItems.filter((_, i) => i !== index));
  };

  const rotatePage = (index) => {
    setPageItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return { ...item, rotation: (item.rotation + 90) % 360 };
        }
        return item;
      })
    );
  };

  const movePageItem = (index, direction) => {
    if (direction === 'left' && index > 0) {
      const newItems = [...pageItems];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      setPageItems(newItems);
    } else if (direction === 'right' && index < pageItems.length - 1) {
      const newItems = [...pageItems];
      [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
      setPageItems(newItems);
    }
  };

  // --- ドラッグ＆ドロップ（ファイル表示モード） ---
  const [draggedFileIndex, setDraggedFileIndex] = useState(null);

  const onFileDragStart = (index) => setDraggedFileIndex(index);
  const onFileDragEnter = (index) => {
    if (draggedFileIndex === null || draggedFileIndex === index) return;
    const newFiles = [...files];
    const draggedItem = newFiles[draggedFileIndex];
    newFiles.splice(draggedFileIndex, 1);
    newFiles.splice(index, 0, draggedItem);

    // 回転情報も並び替え
    const newRotations = {};
    const oldRotations = { ...fileRotations };
    const keys = Object.keys(oldRotations).map(Number).sort((a, b) => a - b);
    // ドラッグ元を抜いて挿入先に差し込むのと同じロジックで回転マップを再構築
    const rotArr = files.map((_, i) => oldRotations[i] || null);
    const draggedRot = rotArr[draggedFileIndex];
    rotArr.splice(draggedFileIndex, 1);
    rotArr.splice(index, 0, draggedRot);
    rotArr.forEach((rot, i) => {
      if (rot) newRotations[i] = rot;
    });

    setDraggedFileIndex(index);
    setFiles(newFiles);
    setFileRotations(newRotations);
  };
  const onFileDragEnd = () => setDraggedFileIndex(null);

  // --- ドラッグ＆ドロップ（ページ表示モード） ---
  const [draggedPageIndex, setDraggedPageIndex] = useState(null);

  const onPageDragStart = (index) => setDraggedPageIndex(index);
  const onPageDragEnter = (index) => {
    if (draggedPageIndex === null || draggedPageIndex === index) return;
    const newItems = [...pageItems];
    const draggedItem = newItems[draggedPageIndex];
    newItems.splice(draggedPageIndex, 1);
    newItems.splice(index, 0, draggedItem);
    setDraggedPageIndex(index);
    setPageItems(newItems);
  };
  const onPageDragEnd = () => setDraggedPageIndex(null);

  // --- 結合処理 ---
  const handleMerge = async () => {
    if (viewMode === 'file') {
      // ファイル表示モード
      if (files.length < 2) {
        alert('結合するには少なくとも2つのPDFファイルを選択してください。');
        return;
      }
      setIsProcessing(true);
      try {
        // 回転情報があるかチェック
        const hasRotation = Object.values(fileRotations).some(
          (rot) => rot && rot.all && rot.all !== 0
        );
        let mergedBytes;
        if (hasRotation) {
          const rotationMap = await buildRotationMapForMerge();
          mergedBytes = await mergePdfsWithRotation(files, rotationMap);
        } else {
          mergedBytes = await mergePdfs(files);
        }
        downloadPdf(mergedBytes, 'merged_document.pdf');
      } catch (error) {
        console.error(error);
        alert('PDFの結合中にエラーが発生しました。ファイルを確認してください。');
      } finally {
        setIsProcessing(false);
      }
    } else {
      // ページ表示モード
      if (pageItems.length < 1) {
        alert('結合するページが1つもありません。');
        return;
      }
      setIsProcessing(true);
      try {
        const mergedBytes = await mergePages(
          pageItems.map((item) => ({
            file: item.file,
            pageNumber: item.pageNumber,
            rotation: item.rotation,
          }))
        );
        downloadPdf(mergedBytes, 'merged_document.pdf');
      } catch (error) {
        console.error(error);
        alert('PDFの結合中にエラーが発生しました。');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // --- プレビュー ---
  const openPreview = (file, pageNumber) => {
    setPreviewFile(file);
    setPreviewPage(pageNumber);
  };

  // --- ファイル表示モードの回転角度を取得するヘルパー ---
  const getFileRotation = (fileIndex) => {
    const rot = fileRotations[fileIndex];
    return rot && rot.all ? rot.all : 0;
  };

  // --- ファイル名を短縮するヘルパー ---
  const truncateName = (name, maxLen = 20) => {
    return name.length > maxLen ? name.substring(0, maxLen) + '...' : name;
  };

  return (
    <div className="merge-container">
      <div className="page-header">
        <h1>PDF結合</h1>
        <p>視覚的に並び替えを行い、複数のPDFを1つのファイルにまとめます。</p>
      </div>

      <div className="layout-grid">
        <div className="upload-section">
          <DragDropZone onFilesSelected={handleFilesSelected} multiple={true} />
        </div>

        {files.length > 0 && (
          <div className="files-section glass-panel">
            {/* ヘッダー: トグル＋結合ボタン */}
            <div className="merge-header">
              <div className="merge-header-left">
                <h3>
                  {viewMode === 'file'
                    ? `選択されたファイル (${files.length})`
                    : `全ページ (${pageItems.length})`}
                </h3>
                {/* 表示モード切替トグル */}
                <div className="view-mode-toggle">
                  <button
                    className={`toggle-btn ${viewMode === 'file' ? 'active' : ''}`}
                    onClick={() => setViewMode('file')}
                    title="ファイル表示"
                  >
                    <FileText size={16} />
                    <span>ファイル表示</span>
                  </button>
                  <button
                    className={`toggle-btn ${viewMode === 'page' ? 'active' : ''}`}
                    onClick={() => setViewMode('page')}
                    title="ページ表示"
                  >
                    <LayoutGrid size={16} />
                    <span>ページ表示</span>
                  </button>
                </div>
              </div>
              <button
                className="btn btn-primary merge-btn"
                onClick={handleMerge}
                disabled={
                  (viewMode === 'file' && files.length < 2) ||
                  (viewMode === 'page' && pageItems.length < 1) ||
                  isProcessing
                }
              >
                {isProcessing ? '処理中...' : 'PDFを結合する'}
              </button>
            </div>

            {/* ファイル表示モード */}
            {viewMode === 'file' && (
              <div className="thumbnail-grid">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className={`thumbnail-card ${draggedFileIndex === index ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => onFileDragStart(index)}
                    onDragEnter={() => onFileDragEnter(index)}
                    onDragEnd={onFileDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="thumbnail-wrapper">
                      <div
                        className="thumbnail-rotatable"
                        style={{ transform: `rotate(${getFileRotation(index)}deg)` }}
                      >
                        <PdfThumbnail file={file} pageNumber={1} width={150} />
                      </div>
                      <button
                        className="preview-btn"
                        onClick={() => openPreview(file, 1)}
                        title="拡大プレビュー"
                      >
                        <ZoomIn size={18} />
                      </button>
                      <button
                        className="rotate-btn"
                        onClick={() => rotateFile(index)}
                        title="90度回転"
                      >
                        <RotateCw size={16} />
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => removeFile(index)}
                        title="削除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="thumbnail-info">
                      <span className="file-name" title={file.name}>
                        {truncateName(file.name)}
                      </span>
                      {getFileRotation(index) !== 0 && (
                        <span className="rotation-badge">{getFileRotation(index)}°</span>
                      )}
                      <div className="move-actions">
                        <button onClick={() => moveFile(index, 'left')} disabled={index === 0}>
                          <ArrowLeft size={14} />
                        </button>
                        <button
                          onClick={() => moveFile(index, 'right')}
                          disabled={index === files.length - 1}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ページ表示モード */}
            {viewMode === 'page' && (
              <>
                {isLoadingPages ? (
                  <div className="loading-pages">
                    <div className="loading-spinner" />
                    <p>ページを読み込み中...</p>
                  </div>
                ) : (
                  <div className="thumbnail-grid page-view-grid">
                    {pageItems.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className={`thumbnail-card ${draggedPageIndex === index ? 'dragging' : ''}`}
                        draggable
                        onDragStart={() => onPageDragStart(index)}
                        onDragEnter={() => onPageDragEnter(index)}
                        onDragEnd={onPageDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                      >
                        <div className="thumbnail-wrapper">
                          <div
                            className="thumbnail-rotatable"
                            style={{ transform: `rotate(${item.rotation}deg)` }}
                          >
                            <PdfThumbnail
                              file={item.file}
                              pageNumber={item.pageNumber}
                              width={140}
                            />
                          </div>
                          <button
                            className="preview-btn"
                            onClick={() => openPreview(item.file, item.pageNumber)}
                            title="拡大プレビュー"
                          >
                            <ZoomIn size={18} />
                          </button>
                          <button
                            className="rotate-btn"
                            onClick={() => rotatePage(index)}
                            title="90度回転"
                          >
                            <RotateCw size={16} />
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => removePage(index)}
                            title="削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="thumbnail-info">
                          <span className="file-name" title={item.fileName}>
                            {truncateName(item.fileName, 15)}
                          </span>
                          <span className="page-number-label">{item.pageNumber}ページ</span>
                          {item.rotation !== 0 && (
                            <span className="rotation-badge">{item.rotation}°</span>
                          )}
                          <div className="move-actions">
                            <button
                              onClick={() => movePageItem(index, 'left')}
                              disabled={index === 0}
                            >
                              <ArrowLeft size={14} />
                            </button>
                            <button
                              onClick={() => movePageItem(index, 'right')}
                              disabled={index === pageItems.length - 1}
                            >
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {previewFile && (
        <PreviewModal
          file={previewFile}
          pageNumber={previewPage}
          onClose={() => {
            setPreviewFile(null);
            setPreviewPage(1);
          }}
        />
      )}
    </div>
  );
}

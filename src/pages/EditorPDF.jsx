import React, { useState, useEffect, useRef, useCallback } from 'react';
import DragDropZone from '../components/DragDropZone';
import { editPdf, downloadPdf } from '../utils/pdfProcessor';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  Type, Square, Circle, ArrowUpRight, Save, Trash2, 
  ArrowLeft, ArrowRight, Settings, MousePointer2, 
  ZoomIn, ZoomOut, Maximize, Image, Pen, Highlighter,
  RotateCw, EyeOff, Undo2, Redo2
} from 'lucide-react';
import './EditorPDF.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default function EditorPDF() {
  const [file, setFile] = useState(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [elements, setElements] = useState([]);
  const [activeElementId, setActiveElementId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState('select');
  const [scale, setScale] = useState(1.0);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Undo/Redo 用の履歴スタック
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // ページ回転情報 { pageNum: degrees }
  const [pageRotations, setPageRotations] = useState({});

  // ペンツール用の描画中の点リスト
  const [currentPenPoints, setCurrentPenPoints] = useState([]);

  // 画像挿入用
  const imageInputRef = useRef(null);
  
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);

  // 履歴に現在の要素状態を記録する
  const pushHistory = useCallback((newElements) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push([...newElements]);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  // 元に戻す
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setElements([...history[newIndex]]);
    setActiveElementId(null);
  }, [historyIndex, history]);

  // やり直し
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setElements([...history[newIndex]]);
    setActiveElementId(null);
  }, [historyIndex, history]);

  // 要素変更を履歴に反映するラッパー
  const setElementsWithHistory = useCallback((updaterOrNewElements) => {
    setElements(prev => {
      const newElements = typeof updaterOrNewElements === 'function' 
        ? updaterOrNewElements(prev) 
        : updaterOrNewElements;
      // 少し遅延して履歴に追加（同一操作内で複数呼ばれるのを防ぐ）
      return newElements;
    });
  }, []);

  // マウスアップ等の「操作の区切り」で履歴をコミットするためのフラグ
  const commitHistoryRef = useRef(false);

  const commitHistory = useCallback(() => {
    setElements(current => {
      pushHistory(current);
      return current;
    });
  }, [pushHistory]);

  const fitToScreen = useCallback(async (doc = pdfDocument, pageNum = currentPage) => {
    if (!doc || !containerRef.current) return;
    const page = await doc.getPage(pageNum);
    const viewport1 = page.getViewport({ scale: 1.0 });
    const availableHeight = containerRef.current.clientHeight - 60;
    const availableWidth = containerRef.current.clientWidth - 40;
    const scaleHeight = availableHeight / viewport1.height;
    const scaleWidth = availableWidth / viewport1.width;
    const bestScale = Math.min(scaleHeight, scaleWidth, 1.5);
    setScale(bestScale > 0 ? bestScale : 1.0);
  }, [pdfDocument, currentPage]);

  const handleFileSelected = async (selectedFiles) => {
    const selectedFile = selectedFiles[0];
    setFile(selectedFile);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const doc = await pdfjsLib.getDocument(arrayBuffer).promise;
      setPdfDocument(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      setElements([]);
      setHistory([[]]);
      setHistoryIndex(0);
      setPageRotations({});
      await fitToScreen(doc, 1);
    } catch (error) {
      console.error(error);
      alert("PDFの読み込みに失敗しました。");
      setFile(null);
    }
  };

  const renderPage = useCallback(async () => {
    if (!pdfDocument || !canvasRef.current) return;
    const page = await pdfDocument.getPage(currentPage);
    const rotation = pageRotations[currentPage] || 0;
    const viewport = page.getViewport({ scale, rotation });
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
  }, [pdfDocument, currentPage, scale, pageRotations]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Delete/Backspace で要素削除
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeElementId !== null) {
        setElements(prev => prev.filter(el => el.id !== activeElementId));
        setActiveElementId(null);
        commitHistory();
        return;
      }
      // Ctrl+Z: 元に戻す
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Y or Ctrl+Shift+Z: やり直し
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        redo();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeElementId, undo, redo, commitHistory]);

  const getRelativeCoords = (e) => {
    const rect = wrapperRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    };
  };

  // ページ回転
  const rotatePage = () => {
    setPageRotations(prev => ({
      ...prev,
      [currentPage]: ((prev[currentPage] || 0) + 90) % 360
    }));
  };

  // 画像選択ハンドラ
  const handleImageSelect = async (e) => {
    const imageFile = e.target.files[0];
    if (!imageFile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const img = new window.Image();
      img.onload = () => {
        const { x, y } = { x: 30, y: 30 }; // キャンバスの中央付近に配置
        const newElement = {
          id: Date.now(),
          type: 'image',
          page: currentPage,
          x, y,
          width: 25,
          height: (25 * img.height) / img.width, // アスペクト比を維持
          imageData: dataUrl,
          imageType: imageFile.type.includes('png') ? 'png' : 'jpg',
          opacity: 1.0,
        };
        setElements(prev => [...prev, newElement]);
        setActiveElementId(newElement.id);
        commitHistory();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(imageFile);
    // inputをリセット（同じファイルを再選択可能にする）
    e.target.value = '';
  };

  // ドラッグ描画開始（キャンバス上でのMouseDown）
  const handleWrapperMouseDown = (e) => {
    if (mode === 'select') {
      if (e.target === wrapperRef.current || e.target === canvasRef.current) {
        setActiveElementId(null);
      }
      return;
    }

    // 画像モードは別処理（ファイル選択ダイアログ）
    if (mode === 'image') return;

    const { x, y } = getRelativeCoords(e);

    // ペンツールの場合
    if (mode === 'pen') {
      setIsDrawing(true);
      setCurrentPenPoints([{ x, y }]);
      return;
    }

    const newElement = {
      id: Date.now(),
      type: mode,
      page: currentPage,
      x, y,
      endX: mode === 'arrow' ? x : undefined,
      endY: mode === 'arrow' ? y : undefined,
      width: mode === 'arrow' ? undefined : 0,
      height: mode === 'arrow' ? undefined : 0,
      text: mode === 'text' ? 'テキスト' : '',
      size: 24,
      color: mode === 'text' ? '#ff0000' : mode === 'highlight' ? '#ffff00' : undefined,
      borderColor: mode === 'whiteout' ? '#ffffff' : '#ff0000',
      fillColor: mode === 'whiteout' ? '#ffffff' : mode === 'highlight' ? '#ffff00' : 'transparent',
      borderWidth: mode === 'highlight' ? 0 : mode === 'whiteout' ? 0 : 2,
      opacity: mode === 'highlight' ? 0.4 : 1.0,
    };

    setElements(prev => [...prev, newElement]);
    setActiveElementId(newElement.id);
    setIsDrawing(true);
  };

  // ドラッグ描画中
  const handleWrapperMouseMove = (e) => {
    if (!isDrawing) return;
    const { x, y } = getRelativeCoords(e);

    // ペンツール
    if (mode === 'pen') {
      setCurrentPenPoints(prev => [...prev, { x, y }]);
      return;
    }

    if (!activeElementId) return;
    
    setElements(prev => prev.map(el => {
      if (el.id !== activeElementId) return el;
      if (el.type === 'arrow') {
        return { ...el, endX: x, endY: y };
      } else {
        const width = Math.max(2, x - el.x);
        const height = Math.max(2, y - el.y);
        return { ...el, width, height };
      }
    }));
  };

  const handleWrapperMouseUp = () => {
    if (!isDrawing) return;

    // ペンツールの場合、点リストを要素として確定
    if (mode === 'pen' && currentPenPoints.length > 1) {
      const newElement = {
        id: Date.now(),
        type: 'pen',
        page: currentPage,
        points: [...currentPenPoints],
        borderColor: '#ff0000',
        borderWidth: 2,
        opacity: 1.0,
        // バウンディングボックスの計算（移動・削除用）
        x: Math.min(...currentPenPoints.map(p => p.x)),
        y: Math.min(...currentPenPoints.map(p => p.y)),
      };
      setElements(prev => [...prev, newElement]);
      setActiveElementId(newElement.id);
      setCurrentPenPoints([]);
    }

    setIsDrawing(false);
    setMode('select');
    commitHistory();
  };

  // 既存要素の移動（ドラッグ）
  const handleDragStart = (e, id) => {
    if (mode !== 'select' || isDrawing) return;
    e.stopPropagation();
    setActiveElementId(id);
    
    const el = elements.find(e => e.id === id);
    if (!el || !wrapperRef.current) return;
    
    const rect = wrapperRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = el.x;
    const initialY = el.y;
    const initialEndX = el.endX;
    const initialEndY = el.endY;
    // ペン要素の初期ポイントをクロージャでキャプチャ（差分ではなく絶対座標で計算）
    const initialPoints = el.type === 'pen' && el.points
      ? el.points.map(p => ({ ...p }))
      : null;

    const onMouseMove = (moveEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
      if (el.type === 'arrow') {
        updateElement(id, { x: initialX + dx, y: initialY + dy, endX: initialEndX + dx, endY: initialEndY + dy });
      } else if (el.type === 'pen' && initialPoints) {
        // 初期ポイントからの絶対的なオフセットで計算（累積ずれが起きない）
        const movedPoints = initialPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
        updateElement(id, { 
          x: initialX + dx, y: initialY + dy,
          points: movedPoints,
        });
      } else {
        updateElement(id, { x: initialX + dx, y: initialY + dy });
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      commitHistory();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // 通常図形のリサイズ
  const handleResizeStart = (e, id) => {
    e.stopPropagation();
    const el = elements.find(e => e.id === id);
    if (!el || !wrapperRef.current) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialW = el.width;
    const initialH = el.height;

    const onMouseMove = (moveEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
      updateElement(id, { 
        width: Math.max(2, initialW + dx), 
        height: Math.max(2, initialH + dy) 
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      commitHistory();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // 矢印の始点・終点ハンドル
  const handleArrowHandleStart = (e, id, isStartPoint) => {
    e.stopPropagation();
    setActiveElementId(id);
    const el = elements.find(e => e.id === id);
    if (!el || !wrapperRef.current) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const initialX = isStartPoint ? el.x : el.endX;
    const initialY = isStartPoint ? el.y : el.endY;

    const onMouseMove = (moveEvent) => {
      const dx = ((moveEvent.clientX - startMouseX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - startMouseY) / rect.height) * 100;
      if (isStartPoint) {
        updateElement(id, { x: initialX + dx, y: initialY + dy });
      } else {
        updateElement(id, { endX: initialX + dx, endY: initialY + dy });
      }
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      commitHistory();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const updateElement = (id, updates) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };
  const removeElement = (id) => {
    setElements(prev => prev.filter(el => el.id !== id));
    if (activeElementId === id) setActiveElementId(null);
    commitHistory();
  };

  const handleSave = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const resultBytes = await editPdf(file, elements, pageRotations);
      downloadPdf(resultBytes, `edited_${file.name}`);
    } catch (error) {
      console.error(error);
      alert("編集したPDFの保存に失敗しました。");
    } finally {
      setIsProcessing(false);
    }
  };

  const activeElement = elements.find(el => el.id === activeElementId);

  // ツールの種類名を表示する
  const getTypeName = (type) => {
    const names = {
      text: 'テキスト', rect: '四角形', circle: '丸（円）', arrow: '矢印',
      image: '画像', pen: 'フリーハンド', highlight: 'ハイライト', whiteout: '墨消し'
    };
    return names[type] || type;
  };

  return (
    <div className="editor-container">
      <div className="page-header">
        <h1>PDF編集</h1>
        <p>文字・図形・画像・フリーハンドなど多彩な編集ができます。</p>
      </div>

      {/* 画像アップロード用の隠しinput */}
      <input 
        ref={imageInputRef}
        type="file" 
        accept="image/png,image/jpeg,image/jpg"
        style={{ display: 'none' }}
        onChange={handleImageSelect}
      />

      {!file ? (
        <DragDropZone onFilesSelected={handleFileSelected} multiple={false} />
      ) : (
        <div className="editor-workspace glass-panel">
          
          <div className="toolbar">
            <div className="tools">
              <button className={`icon-btn tool-btn ${mode === 'select' ? 'active' : ''}`} onClick={() => setMode('select')} title="選択・移動・リサイズ">
                <MousePointer2 size={18} />
              </button>
              <div className="tool-divider" />
              <button className={`icon-btn tool-btn ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')} title="テキストを追加">
                <Type size={18} />
              </button>
              <button className={`icon-btn tool-btn`} onClick={() => imageInputRef.current?.click()} title="画像を追加">
                <Image size={18} />
              </button>
              <button className={`icon-btn tool-btn ${mode === 'pen' ? 'active' : ''}`} onClick={() => setMode('pen')} title="フリーハンド描画">
                <Pen size={18} />
              </button>
              <button className={`icon-btn tool-btn ${mode === 'highlight' ? 'active' : ''}`} onClick={() => setMode('highlight')} title="ハイライト">
                <Highlighter size={18} />
              </button>
              <div className="tool-divider" />
              <button className={`icon-btn tool-btn ${mode === 'rect' ? 'active' : ''}`} onClick={() => setMode('rect')} title="四角形を追加">
                <Square size={18} />
              </button>
              <button className={`icon-btn tool-btn ${mode === 'circle' ? 'active' : ''}`} onClick={() => setMode('circle')} title="丸を追加">
                <Circle size={18} />
              </button>
              <button className={`icon-btn tool-btn ${mode === 'arrow' ? 'active' : ''}`} onClick={() => setMode('arrow')} title="矢印を追加">
                <ArrowUpRight size={18} />
              </button>
              <button className={`icon-btn tool-btn ${mode === 'whiteout' ? 'active' : ''}`} onClick={() => setMode('whiteout')} title="墨消し（ホワイトアウト）">
                <EyeOff size={18} />
              </button>
            </div>

            <div className="toolbar-right">
              {/* Undo / Redo */}
              <div className="undo-redo">
                <button className="icon-btn" onClick={undo} disabled={historyIndex <= 0} title="元に戻す (Ctrl+Z)">
                  <Undo2 size={16} />
                </button>
                <button className="icon-btn" onClick={redo} disabled={historyIndex >= history.length - 1} title="やり直し (Ctrl+Y)">
                  <Redo2 size={16} />
                </button>
              </div>

              {/* ページ回転 */}
              <button className="icon-btn" onClick={rotatePage} title="ページを回転">
                <RotateCw size={16} />
              </button>

              {/* ズーム */}
              <div className="zoom-controls">
                <button className="icon-btn zoom-btn" onClick={() => setScale(s => Math.max(s - 0.2, 0.3))} title="縮小"><ZoomOut size={16} /></button>
                <span className="zoom-level">{Math.round(scale * 100)}%</span>
                <button className="icon-btn zoom-btn" onClick={() => setScale(s => Math.min(s + 0.2, 3.0))} title="拡大"><ZoomIn size={16} /></button>
                <button className="icon-btn zoom-btn" onClick={() => fitToScreen()} title="画面に合わせる"><Maximize size={16} /></button>
              </div>
              
              {/* ページ送り */}
              <div className="pagination">
                <button className="icon-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ArrowLeft size={16} />
                </button>
                <span>{currentPage} / {totalPages}</span>
                <button className="icon-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ArrowRight size={16} />
                </button>
              </div>

              <button className="btn btn-primary" onClick={handleSave} disabled={isProcessing}>
                <Save size={18} /> {isProcessing ? '保存中...' : 'ダウンロード'}
              </button>
            </div>
          </div>

          <div className="editor-main">
            <div className={`canvas-container mode-${mode}`} ref={containerRef}>
              <div 
                className="canvas-wrapper" 
                ref={wrapperRef}
                style={{ position: 'relative' }}
                onMouseDown={handleWrapperMouseDown}
                onMouseMove={handleWrapperMouseMove}
                onMouseUp={handleWrapperMouseUp}
                onMouseLeave={handleWrapperMouseUp}
              >
                <canvas ref={canvasRef} className="pdf-canvas" />
                
                {/* SVGオーバーレイ（矢印＋ペン＋描画中のペン軌跡） */}
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                  {/* 矢印要素 */}
                  {elements.filter(el => el.page === currentPage && el.type === 'arrow').map(el => (
                    <g key={el.id}>
                      <defs>
                        <marker id={`arrowhead-${el.id}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                          <polygon points="0 0, 10 3.5, 0 7" fill={el.borderColor} />
                        </marker>
                      </defs>
                      <line 
                        x1={`${el.x}%`} y1={`${el.y}%`} 
                        x2={`${el.endX}%`} y2={`${el.endY}%`} 
                        stroke={el.borderColor} 
                        strokeWidth={el.borderWidth * scale} 
                        opacity={el.opacity}
                        markerEnd={`url(#arrowhead-${el.id})`}
                        style={{ pointerEvents: 'stroke', cursor: 'move' }}
                        onMouseDown={(e) => { if (!isDrawing) handleDragStart(e, el.id); }}
                      />
                    </g>
                  ))}

                  {/* ペン要素（確定済み） */}
                  {elements.filter(el => el.page === currentPage && el.type === 'pen').map(el => (
                    <polyline 
                      key={el.id}
                      points={el.points.map(p => `${p.x}%,${p.y}%`).join(' ')}
                      fill="none"
                      stroke={el.borderColor}
                      strokeWidth={el.borderWidth * scale}
                      opacity={el.opacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ pointerEvents: 'stroke', cursor: 'move' }}
                      onMouseDown={(e) => { if (!isDrawing) handleDragStart(e, el.id); }}
                    />
                  ))}

                  {/* ペン描画中の軌跡 */}
                  {isDrawing && mode === 'pen' && currentPenPoints.length > 1 && (
                    <polyline 
                      points={currentPenPoints.map(p => `${p.x}%,${p.y}%`).join(' ')}
                      fill="none"
                      stroke="#ff0000"
                      strokeWidth={2 * scale}
                      opacity={1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>

                {/* HTML要素のオーバーレイ */}
                {elements.filter(el => el.page === currentPage && el.type !== 'arrow' && el.type !== 'pen').map(el => {
                  const isActive = el.id === activeElementId;
                  
                  return (
                    <div 
                      key={el.id} 
                      className={`overlay-element ${el.type} ${isActive ? 'active' : ''}`}
                      onMouseDown={(e) => { if (!isDrawing) handleDragStart(e, el.id); }}
                      style={{
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: el.type === 'text' ? 'auto' : `${el.width}%`,
                        height: el.type === 'text' ? 'auto' : `${el.height}%`,
                        minWidth: el.type !== 'text' && (el.width === 0 || !el.width) ? '10px' : undefined,
                        minHeight: el.type !== 'text' && (el.height === 0 || !el.height) ? '10px' : undefined,
                      }}
                    >
                      {el.type === 'text' ? (
                        <input 
                          type="text" 
                          value={el.text} 
                          onChange={e => updateElement(el.id, { text: e.target.value })}
                          onBlur={() => commitHistory()}
                          className="editable-text"
                          style={{ 
                            fontSize: `${el.size * scale}px`,
                            color: el.color,
                            opacity: el.opacity
                          }}
                        />
                      ) : el.type === 'image' ? (
                        <img 
                          src={el.imageData} 
                          alt="挿入画像"
                          className="shape-image"
                          style={{ opacity: el.opacity }}
                          draggable={false}
                        />
                      ) : el.type === 'rect' || el.type === 'whiteout' ? (
                        <div 
                          className="shape-rect"
                          style={{
                            border: el.borderWidth > 0 ? `${el.borderWidth * scale}px solid ${el.borderColor}` : 'none',
                            backgroundColor: el.fillColor,
                            opacity: el.opacity,
                          }}
                        ></div>
                      ) : el.type === 'circle' ? (
                        <div 
                          className="shape-circle"
                          style={{
                            border: `${el.borderWidth * scale}px solid ${el.borderColor}`,
                            backgroundColor: el.fillColor,
                            opacity: el.opacity,
                          }}
                        ></div>
                      ) : el.type === 'highlight' ? (
                        <div 
                          className="shape-rect shape-highlight"
                          style={{
                            backgroundColor: el.fillColor || '#ffff00',
                            opacity: el.opacity,
                          }}
                        ></div>
                      ) : null}
                      
                      {isActive && !isDrawing && (
                        <>
                          <button className="delete-el-btn" onMouseDown={(e) => { e.stopPropagation(); removeElement(el.id); }}>
                            <Trash2 size={14} />
                          </button>
                          {el.type !== 'text' && (
                            <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, el.id)}></div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* 矢印のハンドル */}
                {elements.filter(el => el.page === currentPage && el.type === 'arrow' && el.id === activeElementId).map(el => (
                  <React.Fragment key={`handle-${el.id}`}>
                    <div className="arrow-handle" style={{ left: `${el.x}%`, top: `${el.y}%`, zIndex: 5 }}
                      onMouseDown={(e) => handleArrowHandleStart(e, el.id, true)} />
                    <div className="arrow-handle" style={{ left: `${el.endX}%`, top: `${el.endY}%`, zIndex: 5 }}
                      onMouseDown={(e) => handleArrowHandleStart(e, el.id, false)} />
                    <button className="delete-el-btn" 
                      style={{ left: `${el.endX}%`, top: `calc(${el.endY}% - 30px)`, zIndex: 6 }}
                      onMouseDown={(e) => { e.stopPropagation(); removeElement(el.id); }}>
                      <Trash2 size={14} />
                    </button>
                  </React.Fragment>
                ))}

                {/* ペン要素の削除ボタン */}
                {elements.filter(el => el.page === currentPage && el.type === 'pen' && el.id === activeElementId).map(el => (
                  <button key={`pen-del-${el.id}`} className="delete-el-btn"
                    style={{ left: `${el.x}%`, top: `calc(${el.y}% - 20px)`, zIndex: 6 }}
                    onMouseDown={(e) => { e.stopPropagation(); removeElement(el.id); }}>
                    <Trash2 size={14} />
                  </button>
                ))}
              </div>
            </div>

            {/* プロパティパネル */}
            <div className="properties-panel">
              <div className="panel-header">
                <Settings size={18} />
                <h3>プロパティ</h3>
              </div>
              
              {!activeElement ? (
                <div className="empty-properties">
                  <p>ツールを選択してPDF上でドラッグすると要素が追加されます。</p>
                  <p><kbd>Ctrl+Z</kbd> 元に戻す / <kbd>Ctrl+Y</kbd> やり直し</p>
                  <p><kbd>Delete</kbd> 選択した要素を削除</p>
                </div>
              ) : (
                <div className="properties-form">
                  <div className="prop-group">
                    <label>種類</label>
                    <div className="prop-value">{getTypeName(activeElement.type)}</div>
                  </div>

                  <div className="prop-group">
                    <label>透明度: {Math.round(activeElement.opacity * 100)}%</label>
                    <input 
                      type="range" min="0.1" max="1" step="0.05" 
                      value={activeElement.opacity} 
                      onChange={e => updateElement(activeElement.id, { opacity: parseFloat(e.target.value) })}
                      onMouseUp={() => commitHistory()}
                    />
                  </div>

                  {/* テキスト専用 */}
                  {activeElement.type === 'text' && (
                    <>
                      <div className="prop-group">
                        <label>文字サイズ</label>
                        <input type="number" value={activeElement.size} 
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) updateElement(activeElement.id, { size: v }); }}
                          onBlur={() => commitHistory()} />
                      </div>
                      <div className="prop-group">
                        <label>文字色</label>
                        <div className="color-picker-wrapper">
                          <input type="color" value={activeElement.color} 
                            onChange={e => updateElement(activeElement.id, { color: e.target.value })}
                            onBlur={() => commitHistory()} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ハイライト専用 */}
                  {activeElement.type === 'highlight' && (
                    <div className="prop-group">
                      <label>ハイライト色</label>
                      <div className="color-picker-wrapper">
                        <input type="color" value={activeElement.fillColor || '#ffff00'} 
                          onChange={e => updateElement(activeElement.id, { fillColor: e.target.value })}
                          onBlur={() => commitHistory()} />
                      </div>
                    </div>
                  )}

                  {/* ペン専用 */}
                  {activeElement.type === 'pen' && (
                    <>
                      <div className="prop-group">
                        <label>線の太さ</label>
                        <input type="number" min="1" max="20" value={activeElement.borderWidth} 
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) updateElement(activeElement.id, { borderWidth: v }); }}
                          onBlur={() => commitHistory()} />
                      </div>
                      <div className="prop-group">
                        <label>線の色</label>
                        <div className="color-picker-wrapper">
                          <input type="color" value={activeElement.borderColor} 
                            onChange={e => updateElement(activeElement.id, { borderColor: e.target.value })}
                            onBlur={() => commitHistory()} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* 図形・矢印共通 */}
                  {(activeElement.type === 'rect' || activeElement.type === 'circle' || activeElement.type === 'arrow') && (
                    <>
                      <div className="prop-group">
                        <label>線の太さ</label>
                        <input type="number" min="0" max="20" value={activeElement.borderWidth} 
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0) updateElement(activeElement.id, { borderWidth: v }); }}
                          onBlur={() => commitHistory()} />
                      </div>
                      <div className="prop-group">
                        <label>線の色</label>
                        <div className="color-picker-wrapper">
                          <input type="color" value={activeElement.borderColor} 
                            onChange={e => updateElement(activeElement.id, { borderColor: e.target.value })}
                            onBlur={() => commitHistory()} />
                        </div>
                      </div>
                      
                      {activeElement.type !== 'arrow' && (
                        <div className="prop-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label>背景色</label>
                            <label className="checkbox-label" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                              <input type="checkbox" 
                                checked={activeElement.fillColor === 'transparent'}
                                onChange={(e) => updateElement(activeElement.id, { 
                                  fillColor: e.target.checked ? 'transparent' : '#ff0000' 
                                })}
                                style={{ marginRight: '4px' }} />
                              塗りつぶしなし
                            </label>
                          </div>
                          {activeElement.fillColor !== 'transparent' && (
                            <div className="color-picker-wrapper">
                              <input type="color" value={activeElement.fillColor} 
                                onChange={e => updateElement(activeElement.id, { fillColor: e.target.value })}
                                onBlur={() => commitHistory()} />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

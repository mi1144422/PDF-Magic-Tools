import React, { useCallback, useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import './DragDropZone.css';

export default function DragDropZone({ onFilesSelected, multiple = true, accept = ".pdf" }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      if (files.length > 0) {
        onFilesSelected(multiple ? files : [files[0]]);
      } else {
        alert("PDFファイルのみアップロード可能です。");
      }
    }
  }, [onFilesSelected, multiple]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onFilesSelected(multiple ? files : [files[0]]);
    }
    // 同じファイルを再度選択してもonChangeが発火するようリセット
    e.target.value = '';
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div 
      className={`drop-zone glass-panel ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
      />
      <div className="drop-zone-content">
        <UploadCloud size={48} className="upload-icon" />
        <h3>ここをクリック、またはPDFファイルをドロップ</h3>
        <p>処理はすべてお使いのPC内で完結し、サーバーへは送信されません。</p>
      </div>
    </div>
  );
}

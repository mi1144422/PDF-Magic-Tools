import React from 'react';
import PdfThumbnail from './PdfThumbnail';
import { X } from 'lucide-react';
import './PreviewModal.css';

export default function PreviewModal({ file, pageNumber, onClose }) {
  if (!file) return null;

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal-content" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>プレビュー (ページ: {pageNumber})</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <div className="preview-modal-body">
          {/* より高解像度でレンダリングするために幅を大きく取る */}
          <PdfThumbnail file={file} pageNumber={pageNumber} width={800} />
        </div>
      </div>
    </div>
  );
}

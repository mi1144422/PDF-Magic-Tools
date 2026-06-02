import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default function PdfThumbnail({ file, pageNumber = 1, width = 150 }) {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let renderTask = null;
    let isMounted = true;

    const renderThumbnail = async () => {
      if (!file || !canvasRef.current) return;
      setLoading(true);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await doc.getPage(pageNumber);
        
        if (!isMounted) return;

        const viewport = page.getViewport({ scale: 1.0 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
          console.error("Error rendering thumbnail", error);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    renderThumbnail();

    return () => {
      isMounted = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [file, pageNumber, width]);

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: '4px' }}>
          <span style={{ fontSize: '0.8rem' }}>Loading...</span>
        </div>
      )}
      <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
    </div>
  );
}

import { PDFDocument, degrees } from 'pdf-lib';

/**
 * 複数のPDFファイルを結合する
 * @param {File[]} files - 結合するPDFファイルの配列
 * @returns {Promise<Uint8Array>} 結合されたPDFのバイト配列
 */
export async function mergePdfs(files) {
  if (!files || files.length === 0) {
    throw new Error('No files provided');
  }

  // 新しい空のPDFドキュメントを作成
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    // ファイルをArrayBufferとして読み込む
    const arrayBuffer = await file.arrayBuffer();
    // 読み込んだデータからPDFDocumentオブジェクトをロード
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // すべてのページをコピー
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    
    // コピーしたページを新しいドキュメントに追加
    copiedPages.forEach((page) => {
      mergedPdf.addPage(page);
    });
  }

  // 結合したPDFをバイト配列として保存
  const mergedPdfBytes = await mergedPdf.save();
  return mergedPdfBytes;
}

/**
 * 1つのPDFから指定したページ群を抽出し、新しいPDFを作成する
 * @param {File} file - 分割元のPDFファイル
 * @param {number[]} selectedPages - 抽出するページ番号の配列 (1-indexed, 例: [1, 3, 5])
 * @returns {Promise<Uint8Array>} 抽出されたPDFのバイト配列
 */
export async function splitPdf(file, selectedPages) {
  if (!file) throw new Error('No file provided');
  if (!selectedPages || selectedPages.length === 0) {
    throw new Error('No pages selected');
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  const splitDoc = await PDFDocument.create();
  // PDF-libのページインデックスは0から始まるため -1 する
  const indices = selectedPages.map(page => page - 1);
  
  // ソートしておく（元のページ順を保つ場合）
  indices.sort((a, b) => a - b);

  const copiedPages = await splitDoc.copyPages(pdfDoc, indices);
  copiedPages.forEach((page) => {
    splitDoc.addPage(page);
  });

  return await splitDoc.save();
}

/**
 * PDFを固定間隔で分割する
 * @param {File} file - 分割元のPDFファイル
 * @param {number} interval - 何ページごとに分割するか
 * @returns {Promise<{name: string, bytes: Uint8Array}[]>} 分割されたPDFファイルの配列
 */
export async function splitPdfByInterval(file, interval) {
  if (!file) throw new Error('No file provided');
  if (!interval || interval < 1) throw new Error('Invalid interval');
  
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const totalPages = pdfDoc.getPageCount();
  const results = [];

  for (let start = 0; start < totalPages; start += interval) {
    const end = Math.min(start + interval, totalPages);
    const newDoc = await PDFDocument.create();
    const indices = [];
    for (let i = start; i < end; i++) {
      indices.push(i);
    }
    const copiedPages = await newDoc.copyPages(pdfDoc, indices);
    copiedPages.forEach(page => newDoc.addPage(page));
    
    const baseName = file.name.replace(/\.pdf$/i, '');
    results.push({
      name: `${baseName}_${start + 1}-${end}.pdf`,
      bytes: await newDoc.save()
    });
  }

  return results;
}

/**
 * ページ単位で結合する（ページモード用）
 * @param {{file: File, pageNumber: number, rotation?: number}[]} pageItems - ページ項目の配列
 * @returns {Promise<Uint8Array>} 結合されたPDFのバイト配列
 */
export async function mergePages(pageItems) {
  if (!pageItems || pageItems.length === 0) {
    throw new Error('No pages provided');
  }

  const mergedPdf = await PDFDocument.create();
  // ファイルごとにキャッシュ
  const docCache = new Map();

  for (const item of pageItems) {
    let pdfDoc = docCache.get(item.file);
    if (!pdfDoc) {
      const arrayBuffer = await item.file.arrayBuffer();
      pdfDoc = await PDFDocument.load(arrayBuffer);
      docCache.set(item.file, pdfDoc);
    }

    const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [item.pageNumber - 1]);
    if (item.rotation) {
      copiedPage.setRotation(degrees(item.rotation));
    }
    mergedPdf.addPage(copiedPage);
  }

  return await mergedPdf.save();
}

/**
 * 回転情報付きで結合する
 * @param {File[]} files - 結合するPDFファイルの配列
 * @param {Object} rotations - { fileIndex: { pageIndex: degrees } }
 * @returns {Promise<Uint8Array>}
 */
export async function mergePdfsWithRotation(files, rotations = {}) {
  const mergedPdf = await PDFDocument.create();

  for (let fi = 0; fi < files.length; fi++) {
    const arrayBuffer = await files[fi].arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    
    copiedPages.forEach((page, pi) => {
      const rot = rotations[fi]?.[pi];
      if (rot) {
        page.setRotation(degrees(rot));
      }
      mergedPdf.addPage(page);
    });
  }

  return await mergedPdf.save();
}

/**
 * HEXカラー(#RRGGBB)をpdf-libのRGB(0-1)に変換するヘルパー
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    type: 'RGB',
    red: parseInt(result[1], 16) / 255,
    green: parseInt(result[2], 16) / 255,
    blue: parseInt(result[3], 16) / 255
  } : { type: 'RGB', red: 0, green: 0, blue: 0 };
}

/**
 * PDFにテキストや図形を追加する
 * @param {File} file - 元のPDFファイル
 * @param {Array} elements - 追加する要素の配列
 * @param {Object} pageRotations - ページの回転情報 { pageNum: degrees }
 * @returns {Promise<Uint8Array>}
 */
export async function editPdf(file, elements, pageRotations = {}) {
  if (!file) throw new Error('No file provided');
  
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();

  // ページ回転の適用
  for (const [pageNum, rotation] of Object.entries(pageRotations)) {
    const pageIndex = parseInt(pageNum) - 1;
    if (pageIndex >= 0 && pageIndex < pages.length && rotation) {
      pages[pageIndex].setRotation(degrees(rotation));
    }
  }

  for (const el of elements) {
    const pageIndex = el.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    // 画面上の%座標からPDF上のポイント座標へ変換
    const px = (el.x / 100) * width;
    const py = height - ((el.y / 100) * height);

    if (el.type === 'text') {
      page.drawText(el.text || 'Text', {
        x: px,
        y: py,
        size: el.size || 16,
        color: hexToRgb(el.color || '#ff0000'),
        opacity: el.opacity !== undefined ? el.opacity : 1.0,
      });
    } else if (el.type === 'rect' || el.type === 'whiteout') {
      const rw = (el.width / 100) * width;
      const rh = (el.height / 100) * height;
      const rectOptions = {
        x: px,
        y: py - rh, 
        width: rw,
        height: rh,
        opacity: el.opacity !== undefined ? el.opacity : 1.0,
      };
      if (el.borderWidth > 0) {
        rectOptions.borderWidth = el.borderWidth || 2;
        rectOptions.borderColor = hexToRgb(el.borderColor || '#ff0000');
      }
      if (el.fillColor && el.fillColor !== 'transparent') {
        rectOptions.color = hexToRgb(el.fillColor);
      }
      page.drawRectangle(rectOptions);
    } else if (el.type === 'highlight') {
      // ハイライト = 半透明の塗りつぶし矩形
      const rw = (el.width / 100) * width;
      const rh = (el.height / 100) * height;
      page.drawRectangle({
        x: px,
        y: py - rh,
        width: rw,
        height: rh,
        color: hexToRgb(el.fillColor || '#ffff00'),
        opacity: el.opacity !== undefined ? el.opacity : 0.4,
      });
    } else if (el.type === 'circle') {
      const rw = (el.width / 100) * width;
      const rh = (el.height / 100) * height;
      const circleOptions = {
        x: px + rw / 2,
        y: py - rh / 2,
        xScale: rw / 2,
        yScale: rh / 2,
        borderWidth: el.borderWidth || 2,
        borderColor: hexToRgb(el.borderColor || '#ff0000'),
        opacity: el.opacity !== undefined ? el.opacity : 1.0,
      };
      if (el.fillColor && el.fillColor !== 'transparent') {
        circleOptions.color = hexToRgb(el.fillColor);
      }
      page.drawEllipse(circleOptions);
    } else if (el.type === 'arrow') {
      const startX = px;
      const startY = py;
      const ex = (el.endX / 100) * width;
      const ey = height - ((el.endY / 100) * height);

      page.drawLine({
        start: { x: startX, y: startY },
        end: { x: ex, y: ey },
        thickness: el.borderWidth || 2,
        color: hexToRgb(el.borderColor || '#ff0000'),
        opacity: el.opacity !== undefined ? el.opacity : 1.0,
      });
      // 矢尻（簡易的な円）
      page.drawEllipse({
        x: ex, y: ey,
        xScale: (el.borderWidth || 2) * 2,
        yScale: (el.borderWidth || 2) * 2,
        color: hexToRgb(el.borderColor || '#ff0000'),
        opacity: el.opacity !== undefined ? el.opacity : 1.0,
      });
    } else if (el.type === 'pen') {
      // フリーハンド描画：点の配列を連続する線として描画
      if (el.points && el.points.length > 1) {
        for (let i = 0; i < el.points.length - 1; i++) {
          const p1 = el.points[i];
          const p2 = el.points[i + 1];
          page.drawLine({
            start: {
              x: (p1.x / 100) * width,
              y: height - ((p1.y / 100) * height)
            },
            end: {
              x: (p2.x / 100) * width,
              y: height - ((p2.y / 100) * height)
            },
            thickness: el.borderWidth || 2,
            color: hexToRgb(el.borderColor || '#ff0000'),
            opacity: el.opacity !== undefined ? el.opacity : 1.0,
          });
        }
      }
    } else if (el.type === 'image') {
      // 画像の埋め込み
      try {
        const imageDataUrl = el.imageData;
        const base64Data = imageDataUrl.split(',')[1];
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        let embeddedImage;
        if (el.imageType === 'png') {
          embeddedImage = await pdfDoc.embedPng(imageBytes);
        } else {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        }
        
        const imgW = (el.width / 100) * width;
        const imgH = (el.height / 100) * height;
        
        page.drawImage(embeddedImage, {
          x: px,
          y: py - imgH,
          width: imgW,
          height: imgH,
          opacity: el.opacity !== undefined ? el.opacity : 1.0,
        });
      } catch (err) {
        console.error('画像の埋め込みに失敗:', err);
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Uint8Arrayをブラウザでダウンロードさせるヘルパー関数
 * @param {Uint8Array} bytes - ダウンロードするデータ
 * @param {string} filename - ファイル名
 */
export function downloadPdf(bytes, filename = 'document.pdf') {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // ブラウザがBlobURLからデータを読み込む前にrevokeされるのを防ぐため遅延
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * ZIPファイルをダウンロードさせるヘルパー関数
 * @param {Blob} blob - ZIPデータ
 * @param {string} filename - ファイル名
 */
export function downloadZip(blob, filename = 'split_files.zip') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // ブラウザがBlobURLからデータを読み込む前にrevokeされるのを防ぐため遅延
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

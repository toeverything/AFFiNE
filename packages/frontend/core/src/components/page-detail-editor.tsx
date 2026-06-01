import './page-detail-editor.css';

import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
// 1. 確保 React 核心與 Hooks 正常引入
import React, { useState, useRef, useEffect } from 'react';
// 2. 引入將 HTML 轉成圖片的 html2canvas 套件
import html2canvas from 'html2canvas';

import type { AffineEditorContainer } from '../blocksuite/block-suite-editor';
import { BlockSuiteEditor } from '../blocksuite/block-suite-editor';
import { DocService } from '../modules/doc';
import { EditorService } from '../modules/editor';
import { EditorSettingService } from '../modules/editor-setting';
import * as styles from './page-detail-editor.css';

declare global {
  // oxlint-disable-next-line no-var
  var currentEditor: AffineEditorContainer | undefined;
}

export type OnLoadEditor = (
  editor: AffineEditorContainer
) => (() => void) | void;

export interface PageDetailEditorProps {
  onLoad?: OnLoadEditor;
  readonly?: boolean;
}

type DocMetaWithHeaderImage = {
  headerImage?: string;
};

export const PageDetailEditor = ({
  onLoad,
  readonly,
}: PageDetailEditorProps) => {
  const editor = useService(EditorService).editor;
  const mode = useLiveData(editor.mode$);
  const defaultOpenProperty = useLiveData(editor.defaultOpenProperty$);

  const doc = useService(DocService).doc;
  const docMeta = useLiveData(doc.meta$) as DocMetaWithHeaderImage | null;
  const pageWidth = useLiveData(doc.properties$.selector(p => p.pageWidth));

  const isSharedMode = editor.isSharedMode;
  const editorSetting = useService(EditorSettingService).editorSetting;
  const settings = useLiveData(
    editorSetting.settings$.selector(s => ({
      fontFamily: s.fontFamily,
      customFontFamily: s.customFontFamily,
      fullWidthLayout: s.fullWidthLayout,
    }))
  );
  const fullWidthLayout = pageWidth
    ? pageWidth === 'fullWidth'
    : settings.fullWidthLayout;

  // =================================================================
  // 📸 狀態與函式注入區：讓這些狀態活在 PageDetailEditor 的肚子裡
  // =================================================================
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  // 模擬呼叫 AI 提煉大綱（DOM 畫面暴力搜捕版，絕不噴型別錯誤）
  const handleFetchAISummary = async () => {
    setIsGenerating(true);
    
    try {
      // 💡 終極科技：直接去網頁畫面上，把 AFFiNE 編輯器裡所有打出來的文字區塊通通抓過來！
      // AFFiNE 的 BlockSuite 編輯器常用的文字節點通常帶有 'affine-paragraph' 或 '.v-text' 或 'v-line'
      // 這裡我們把所有可能是文字段落的標籤和常見的 class 通通掃描一遍
      const textElements = document.querySelectorAll(
        '.affine-paragraph, [data-block-type="paragraph"], .v-text, p, [contenteditable="true"]'
      );
      
      // 把抓到的網頁元件文字抽取出來，用換行黏起來
      let rawText = Array.from(textElements)
        .map(el => el.textContent || '')
        .filter(text => text.trim().length > 0)
        .join('\n')
        .trim();

      // 💡 備份草案：如果因為免登入導致抓不到特定的 class，我們直接抓整塊編輯器容器裡的文字
      if (!rawText) {
        const editorContainer = document.querySelector('.affine-editor-container, #editor, [data-page-id]');
        rawText = editorContainer?.textContent?.trim() || '';
      }
      
      // 萬一真的還是空的，就走貼心提示
      if (!rawText) {
        setAiSummary([
          "📖 今天是個神祕的日子...",
          "✍️ 稍微在下方編輯器裡敲點字，",
          "✨ 就能一鍵生成專屬的 IG 限動大綱喔！"
        ]);
        setIsGenerating(false);
        return;
      }

      // ✂️ 依據標點符號或換行切出前 3 句
      const sentences = rawText
        .split(/[。\n!?]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 2) // 過濾掉太短的碎字
        .slice(0, 3); // 霸氣抓取前 3 句！

      if (sentences.length === 0) {
        sentences.push(rawText.slice(0, 25));
        if (rawText.length > 25) sentences.push(rawText.slice(25, 50));
        if (rawText.length > 50) sentences.push(rawText.slice(50, 75));
      }

      // 延遲 0.5 秒模擬 AI 在思考的酷炫動態
      setTimeout(() => {
        const emojiList = ["✨", "📌", "⏳"];
        const formattedSummary = sentences.map((sentence: string, idx: number) => {
          return `${emojiList[idx] || "▪️"} ${sentence}`;
        });

        setAiSummary(formattedSummary);
        setIsGenerating(false);
      }, 600);

    } catch (error) {
      console.error("從網頁畫面撈取文字失敗:", error);
      setIsGenerating(false);
    }
  };

  // 處理使用者上傳的 IG 背景照片
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBgImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 將 HTML 渲染成一張圖並下載
  const handleDownloadForIG = async () => {
    if (!shareCardRef.current) return;
    const canvas = await html2canvas(shareCardRef.current, {
      useCORS: true,
      scale: 2,
    });
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `AFFiNE-Story-${new Date().toISOString().slice(0,10)}.png`;
    link.href = dataUrl;
    link.click();
  };
  // =================================================================

  useEffect(() => {
    editor.doc.blockSuiteDoc.readonly = readonly ?? false;
  }, [editor, readonly]);

  return (
    <>
      {/* ----------------------------------------------------------------- */}
      {/* 🚀 方案 A 強制外掛測試區：不需要任何登入或日記判斷，直接橫空出世 */}
      <div className="ig-share-panel" style={{ padding: '20px', background: '#f5f5f7', borderRadius: '12px', marginBottom: '20px', border: '2px dashed #E1306C', zIndex: 9999, position: 'relative' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#E1306C' }}>✨ Instagram Story 測試工坊 (免登入完全體版)</h4>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button 
            onClick={handleFetchAISummary}
            disabled={isGenerating}
            style={{ padding: '8px 12px', background: '#0071e3', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            {isGenerating ? 'AI 正在提煉中...' : '🤖 模擬 AI 伸出大綱手'}
          </button>
          
          <label style={{ padding: '8px 12px', background: '#e8e8ed', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', color: '#1d1d1f' }}>
            📸 丟入 IG 背景照片
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          </label>

          {aiSummary.length > 0 && (
            <button onClick={handleDownloadForIG} style={{ padding: '8px 12px', background: '#E1306C', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              🚀 點我下載 IG 限動圖片
            </button>
          )}
        </div>

        {/* 🔮 準備被拍成照片的 IG 1080x1920 預覽卡片 */}
        {aiSummary.length > 0 && (
          <div 
            ref={shareCardRef}
            style={{
              width: '315px',
              height: '560px',
              backgroundColor: bgImage ? 'transparent' : '#ffffff',
              backgroundImage: bgImage ? `url(${bgImage})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '30px',
              color: bgImage ? '#ffffff' : '#111111',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
            }}
          >
            {bgImage && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.4)', zIndex: 1 }} />}
            <div style={{ zIndex: 2, textAlign: 'center', width: '100%' }}>
              <p style={{ letterSpacing: '4px', fontSize: '11px', opacity: 0.8, margin: '0 0 5px 0' }}>DAILY LOG</p>
              <h2 style={{ fontSize: '18px', margin: '0 0 35px 0', fontWeight: 600 }}>April 15, 2026 [cite: 106]</h2>
              <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {aiSummary.map((bullet, index) => (
                  <div key={index} style={{ 
                    fontSize: '14px', lineHeight: '1.6', 
                    background: bgImage ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.03)',
                    backdropFilter: bgImage ? 'blur(8px)' : 'none',
                    padding: '10px 14px', borderRadius: '8px',
                    border: bgImage ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.05)'
                  }}>{bullet}</div>
                ))}
              </div>
              <p style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, fontSize: '10px', opacity: 0.5, letterSpacing: '2px' }}>
                via AFFiNE Journal
              </p>
            </div>
          </div>
        )}
      </div>
      {/* ----------------------------------------------------------------- */}

      {docMeta?.headerImage && (
        <img
          src={docMeta.headerImage}
          alt="Document header"
          style={{
            width: '100%',
            maxHeight: 240,
            objectFit: 'cover',
            borderRadius: 8,
            marginBottom: 12,
          }}
        />
      )}

      <BlockSuiteEditor
        className={clsx(styles.editor, {
          'full-screen': !isSharedMode && fullWidthLayout,
          'is-public': isSharedMode,
        })}
        mode={mode}
        defaultOpenProperty={defaultOpenProperty}
        page={editor.doc.blockSuiteDoc}
        shared={isSharedMode}
        readonly={readonly}
        onEditorReady={onLoad}
      />
    </>
  );
};
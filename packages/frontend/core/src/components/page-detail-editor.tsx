import './page-detail-editor.css';

import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useEffect } from 'react';

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

  useEffect(() => {
    editor.doc.blockSuiteDoc.readonly = readonly ?? false;
  }, [editor, readonly]);

  return (
    <>
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

import React, { useState, useRef } from 'react';
// 引入一個前端將 HTML 轉成圖片的超強神級套件
import html2canvas from 'html2canvas'; 

export function JournalPage() {
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  // 模擬呼叫 AI 提煉大綱（未來你可以對接後端 LLM）
  const handleFetchAISummary = async () => {
    setIsGenerating(true);
    // 這裡先用靜態文字模擬，實際開發時可以撈取編輯器內文送到 AI
    setTimeout(() => {
      setAiSummary([
        "☕ 在公館靜謐的咖啡廳度過悠閒午後",
        "💻 直球對決！成功馴服了複雜的全端環境",
        "🍜 犒賞自己一碗熱騰騰的辣味噌拉麵，滿足！"
      ]);
      setIsGenerating(false);
    }, 1500);
  };

  // 處理使用者上傳的 IG 背景照片
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBgImage(reader.result as string); // 轉成 Base64 餵給背景
      };
      reader.readAsDataURL(file);
    }
  };

  // 核心科技：將 HTML 渲染成一張圖並下載
  const handleDownloadForIG = async () => {
    if (!shareCardRef.current) return;
    
    // 使用 html2canvas 把隱藏或顯示的 IG 區塊直接拍成一張照片
    const canvas = await html2canvas(shareCardRef.current, {
      useCORS: true, // 允許跨域圖片
      scale: 2, // 提升清晰度，這樣放上 IG 才不會糊掉
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `AFFiNE-Story-${new Date().toISOString().slice(0,10)}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
  <>
    {/* ----------------------------------------------------------------- */}
    {/* 🚀 方案 A 強制測試區：直接把 IG 分享面板騎在最上面，不需要任何登入或日記判斷 */}
    <div className="ig-share-panel" style={{ padding: '20px', background: '#f5f5f7', borderRadius: '12px', marginBottom: '20px', border: '2px dashed #E1306C', zIndex: 9999, position: 'relative' }}>
      <h4 style={{ margin: '0 0 10px 0', color: '#E1306C' }}>✨ Instagram Story 測試工坊 (免登入版)</h4>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button 
          onClick={() => setAiSummary([
            "☕ 在公館靜謐的咖啡廳度過悠閒午後 [cite: 108]",
            "💻 直球對決！成功馴服了複雜的全端環境",
            "🍜 犒賞自己一碗熱騰騰的辣味噌拉麵，滿足！ [cite: 108]"
          ])}
          style={{ padding: '8px 12px', background: '#0071e3', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          🤖 模擬 AI 伸出大綱手
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

    {/* 👇 底下維持原本 AFFiNE 的老代碼不變 */}
    {docMeta?.headerImage && (
      <img src={docMeta.headerImage} alt="Document header" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }} />
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
}

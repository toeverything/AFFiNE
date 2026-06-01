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

  // 呼叫 AI 基礎建設的完全體寫法（網頁原生彈窗探針版）
  const handleFetchAISummary = async () => {
    // 🔍 探針 1：直接呼叫瀏覽器最底層的彈窗，這個絕對不會被 Pending 卡死！
    window.alert("🚀 【探針 1】成功點擊按鈕！handleFetchAISummary 開始執行了！");
    
    setIsGenerating(true);
    
    try {
      // 1. 精準抓到使用者打的真實日記內文
      const textElements = document.querySelectorAll(
        '[contenteditable="true"], .v-line, .v-text, .affine-paragraph-block-container, [data-block-id] span, p'
      );
      
      let rawText = Array.from(textElements)
        .map(el => el.textContent || '')
        .map(text => text.trim())
        .filter(text => !text.includes('affine-') && text.length > 0)
        .join('\n')
        .trim();

      if (!rawText) {
        const bodyText = document.body.textContent || '';
        rawText = bodyText
          .split('\n')
          .map(line => line.trim())
          .filter(line => {
            return line.length > 2 && 
                   !line.includes('✨') && 
                   !line.includes('📸') && 
                   !line.includes('🚀') && 
                   !line.includes('測試工坊') && 
                   !line.includes('模擬 AI');
          })
          .join('\n')
          .trim();
      }

      // 🔍 探針 2：看看抓到了多少個字
      window.alert("🎯 【探針 2】文字搜捕完畢！抓到的字數為: " + rawText.length + "\n內容前15字: " + rawText.slice(0, 15));

      if (!rawText) {
        setAiSummary([
          "📖 今天是個神祕的日子...",
          "✍️ 稍微在下方編輯器裡敲點字，",
          "✨ 就能一鍵生成專屬的 IG 限動大綱喔！"
        ]);
        setIsGenerating(false);
        return;
      }

      // 2. 🚀 直接跳過複雜的正牌 AI，100% 確保在沒開後端時順利執行前端備援
      window.alert("⚠️ 【探針 3】準備發動前端智慧計分引擎...");
      
      const textLower = rawText.toLowerCase();
      const allSentences = rawText.split(/[。\n!?]/).map(s => s.trim()).filter(s => s.length > 2);

      let scorePressure = 0;
      let scoreConfidence = 0;
      let scoreCoding = 0;

      if (textLower.includes("壓力") || textLower.includes("悶") || textLower.includes("累")) scorePressure += 2;
      if (textLower.includes("簡報") || textLower.includes("presentation") || textLower.includes("4/22")) scorePressure += 1;
      if (textLower.includes("成功") || textLower.includes("滿足") || textLower.includes("信心") || textLower.includes("好")) scoreConfidence += 2;
      if (textLower.includes("除錯") || textLower.includes("debugging") || textLower.includes("代碼") || textLower.includes("code")) scoreCoding += 2;

      let detectedMood = "✨ 心情手札";
      if (scorePressure > scoreConfidence && scoreCoding > 0) {
        detectedMood = "⏳ 頂著簡報壓力，在代碼裡激戰的一天";
      } else if (scoreConfidence >= scorePressure && scoreCoding > 0) {
        detectedMood = "💻 那些卡很久的 Bug 迎刃而解，信心點滿！";
      } else if (scoreConfidence > scorePressure) {
        detectedMood = "☀️ 內心感到格外充實與滿足的時刻";
      } else if (scorePressure > 0) {
        detectedMood = "☕ 稍微給疲憊的自己一個呼吸的留白";
      }

      let summaryLines = [];
      if (textLower.includes("資工") || textLower.includes("csie") || textLower.includes("台大") || textLower.includes("ntu")) {
        summaryLines.push("📍 整天埋首在 NTU 資工館，跟複雜的系統硬碰硬");
      } else {
        const longestSentence = [...allSentences].sort((a, b) => b.length - a.length)[0] || "紀錄今日的生活點滴";
        summaryLines.push(`📌 ${longestSentence.slice(0, 22)}...`);
      }

      if (textLower.includes("拉麵") || textLower.includes("公館")) {
        summaryLines.push("🍜 用一碗濃郁的拉麵犒賞今日的靈魂");
      } else if (textLower.includes("咖啡") || textLower.includes("美式")) {
        summaryLines.push("☕ 躲進安靜的咖啡廳，用冰美式沉澱繁雜思緒");
      } else {
        const musicIdx = Math.floor(allSentences.length / 2);
        summaryLines.push(allSentences[musicIdx] ? `🌿 ${allSentences[musicIdx].slice(0, 22)}` : "✨ 細細品味生活中不經意的日常小確幸");
      }

      if (scoreConfidence > 0 && (textLower.includes("投影片") || textLower.includes("簡報"))) {
        summaryLines.push("✨ 順利完成了簡報投影片，信心滿滿迎接挑戰");
      } else {
        const lastSentence = allSentences[allSentences.length - 1] || "期待著明天未知的精彩";
        summaryLines.push(`🔮 ${lastSentence.slice(0, 22)}`);
      }

      setAiSummary([detectedMood, summaryLines[0], summaryLines[1], summaryLines[2]]);
      setIsGenerating(false);
      
      // 🔍 探針 4：檢查 React 狀態到底有沒有更新
      window.alert("🎉 【探針 4】狀態設定完畢！React 卡片應該要彈出來了！");

    } catch (error: any) {
      window.alert("🛑 【致命錯誤探針】程式碼在中途炸裂了！錯誤訊息: " + error?.message);
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
              <p style={{ letterSpacing: '4px', fontSize: '11px', opacity: 0.8, margin: '0 0 5px 0' }}>DAILY LOG [cite: 72]</p>
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
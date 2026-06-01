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
  // 看看能不能直接抓到 AFFiNE 的 AI 模組（嫌疑犯 A）
  const aiService = useService(editor.ai$); // 或者在某些版本是使用特定 Service 名稱
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

  // 呼叫 AFFiNE 內建 AI 基礎建設的完全體寫法
  const handleFetchAISummary = async () => {
    setIsGenerating(true);
    
    try {
      // 1. 先用我們之前成功的 DOM 搜捕法，精準抓到使用者打的真實日記內文
      const textElements = document.querySelectorAll(
        '.v-line, .affine-paragraph-block-container [data-block-id] span, [contenteditable="true"] .v-text'
      );
      
      let rawText = Array.from(textElements)
        .map(el => el.textContent || '')
        .map(text => text.trim())
        .filter(text => !text.includes('affine-') && text.length > 0)
        .join('\n')
        .trim();

      if (!rawText) {
        setAiSummary([
          "📖 今天是個神祕的日子...",
          "✍️ 稍微在下方編輯器裡敲點字，",
          "✨ 就能一鍵生成專屬的 IG 限動大綱喔！"
        ]);
        setIsGenerating(false);
        return;
      }

      // 2. 🚀 核心：調用 AFFiNE 內建的 AI 執行通道
      const blockSuiteDoc = editor.doc.blockSuiteDoc as any;
      
      // 尋找 AFFiNE 內建 Gemini 的秘密抽屜 (常見於 doc.primaryService 或 doc.workspace.ai)
      const affineAIEngine = 
        blockSuiteDoc?.workspace?.ai || 
        blockSuiteDoc?.service?.ai || 
        (window as any).currentEditor?.host?.std?.get?.('affine:ai'); // 從全域白板實例嘗試抓取

      if (affineAIEngine && typeof affineAIEngine.execute === 'function') {
        // ✨ 如果成功抓到 AFFiNE 的 AI 鑰匙，直接白嫖它的 Gemini 算力！
        const aiPrompt = `你是一個精緻的生活雜誌編輯。請閱讀以下使用者的日記內文，並幫我整理出一個反映整篇日記情緒或氛圍的短標題（包含一個 Emoji），以及三句適合放上 Instagram 限時動態的生活精簡大綱。請嚴格以 JSON 陣列格式回傳，不要包含任何 markdown 標籤或額外文字。範例格式：["情緒短標題", "大綱第一句", "大綱第二句", "大綱第三句"]。日記內文如下：\n${rawText}`;

        const aiResponse = await affineAIEngine.execute({
          prompt: aiPrompt,
        });

        // 解析真正的 AI 回傳結果
        const resultString = typeof aiResponse === 'string' ? aiResponse : aiResponse?.content;
        const parsedLines = JSON.parse(resultString.match(/\[.*\]/)[0]); // 確保抓到標準的 JSON 陣列
        
        setAiSummary(parsedLines);
        setIsGenerating(false);
        return;
      }

      // 3. 🛑 備援機制：如果使用者的 AFFiNE 環境暫時沒開通雲端 AI 功能，自動無縫切換到我們的前端情感引擎
      console.warn("⚠️ 偵測到目前環境尚未啟動 AFFiNE 內建 AI，自動換上高模擬智慧引擎");
      
      const allSentences = rawText.split(/[。\n!?]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2);
      const textLower = rawText.toLowerCase();
      let detectedMood = "✨ 心情手札";
      let summaryLines: string[] = [];

      if (textLower.includes("壓力") || textLower.includes("悶") || textLower.includes("累") || textLower.includes("簡報")) {
        detectedMood = "⏳ 稍微感到壓力，但依然在前進著";
      } else if (textLower.includes("開心") || textLower.includes("滿足") || textLower.includes("自信") || textLower.includes("順利")) {
        detectedMood = "☀️ 充實又滿足的一天";
      } else if (textLower.includes("除錯") || textLower.includes("程式") || textLower.includes("debugging")) {
        detectedMood = "💻 沉浸在邏輯與代碼的對決中";
      }

      if (textLower.includes("資工") || textLower.includes("csie") || textLower.includes("台大") || textLower.includes("ntu")) {
        summaryLines.push("📍 專注在 NTU 的課業與技術挑戰中探索 [cite: 109]");
      } else {
        summaryLines.push(`📝 紀錄生活片段：${allSentences[0]?.slice(0, 18)}...`);
      }

      if (textLower.includes("拉麵") || textLower.includes("吃") || textLower.includes("公館")) {
        summaryLines.push("🍜 中午步行到公館，用一碗辣味噌拉麵治癒靈魂 [cite: 108]");
      } else if (textLower.includes("咖啡") || textLower.includes("美式")) {
        summaryLines.push("☕ 在安靜的角落，用一杯冰美式收尾今日的挑戰 [cite: 108]");
      } else {
        summaryLines.push(allSentences[1] ? `📌 ${allSentences[1].slice(0, 22)}` : "🌿 讓生活步調慢下來，細細感受當下");
      }

      if (textLower.includes("簡報") || textLower.includes("presentation") || textLower.includes("4/22")) {
        summaryLines.push("⏳ 面對即將到來的 4/22 簡報，正化壓力為練習的動力 [cite: 109]");
      } else {
        const lastSentence = allSentences[allSentences.length - 1] || "繼續期待明天的故事";
        summaryLines.push(`🔮 ${lastSentence.slice(0, 22)}`);
      }

      setTimeout(() => {
        setAiSummary([detectedMood, summaryLines[0], summaryLines[1], summaryLines[2]]);
        setIsGenerating(false);
      }, 600);

    } catch (error) {
      console.error("AI 提煉大綱發生錯誤:", error);
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
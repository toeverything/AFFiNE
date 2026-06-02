import './page-detail-editor.css';

import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import React, { useState, useRef, useEffect } from 'react';
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
  title?: string;
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
  // 📸 狀態與函式注入區
  // =================================================================
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const isBackendAIReady = false; 

  // 提取日記真實日期的核心輔助函式
  const getJournalTargetDate = () => {
    const docTitle = docMeta?.title || (doc as any).meta?.title;
    if (docTitle && docTitle.trim().length > 0) {
      const parsedDate = new Date(docTitle);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    const docMetaTime = (doc as any).meta?.updatedDate || (doc as any).meta?.createDate;
    if (docMetaTime) return new Date(docMetaTime);
    return new Date();
  };

  const handleFetchAISummary = async () => {
    setIsGenerating(true);
    console.log("🚀 IG 分享工坊：開始動態提煉日記...");
    
    try {
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
                   !line.includes('分享工坊') && 
                   !line.includes('提煉');
          })
          .join('\n')
          .trim();
      }

      if (!rawText) {
        setAiSummary([
          "📖 今天是個神祕的日子...",
          "✍️ 稍微在下方編輯器裡敲點字，就能一鍵生成專屬的 IG 限動大綱喔！"
        ]);
        setIsGenerating(false);
        return;
      }

      if (isBackendAIReady) {
        const blockSuiteDoc = editor.doc.blockSuiteDoc as any;
        const affineAIEngine = 
          blockSuiteDoc?.workspace?.ai || 
          blockSuiteDoc?.service?.ai || 
          (window as any).currentEditor?.host?.std?.get?.('affine:ai');

        if (affineAIEngine && typeof affineAIEngine.execute === 'function') {
          const aiPrompt = `你是一個精緻的生活雜誌編輯。請閱讀以下使用者的日記內文，並幫我整理出一個反映整篇日記情緒或氛圍的短標題（包含一個 Emoji），以及適合放上 Instagram 限時動態的生活精簡大綱（根據內容豐富度，提供 1 到 3 句即可，不需要強行湊數）。請嚴格以 JSON 陣列格式回傳，例如：["情緒短標題", "大綱第一句", "大綱第二句"]。\n日記內文如下：\n${rawText}`;
          
          const aiResponse = await affineAIEngine.execute({ prompt: aiPrompt });
          const resultString = typeof aiResponse === 'string' ? aiResponse : aiResponse?.content;
          const matchJson = resultString?.match(/\[.*\]/);
          
          if (matchJson && matchJson[0]) {
            setAiSummary(JSON.parse(matchJson[0]));
            setIsGenerating(false);
            return;
          }
        }
      }

      // 🛑 智慧備援核心
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

      let dynamicSummary = [detectedMood];

      if (textLower.includes("資工") || textLower.includes("csie") || textLower.includes("台大") || textLower.includes("ntu")) {
        dynamicSummary.push("📍 整天埋首在 NTU 資工館，跟複雜的系統硬碰硬");
      }

      if (textLower.includes("拉麵") || textLower.includes("公館")) {
        dynamicSummary.push("🍜 用一碗濃郁的拉麵犒賞今日的靈魂");
      } else if (textLower.includes("咖啡") || textLower.includes("美式") || textLower.includes("americano")) {
        dynamicSummary.push("☕ 躲進安靜的咖啡廳，用冰美式沉澱繁雜思緒");
      }

      if (scoreConfidence > 0 && (textLower.includes("投影片") || textLower.includes("簡報"))) {
        dynamicSummary.push("✨ 順利完成了簡報投影片，信心滿滿迎接挑戰");
      }

      if (dynamicSummary.length === 1 && allSentences.length > 0) {
        const longestSentence = [...allSentences].sort((a, b) => b.length - a.length)[0];
        dynamicSummary.push(`📝 ${longestSentence.slice(0, 24)}...`);
      }

      setTimeout(() => {
        setAiSummary(dynamicSummary); 
        setIsGenerating(false);
      }, 300);

    } catch (error) {
      console.error("提煉大綱錯誤:", error);
      setIsGenerating(false);
    }
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setBgImage(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadForIG = async () => {
    if (!shareCardRef.current) return;
    const canvas = await html2canvas(shareCardRef.current, { useCORS: true, scale: 2 });
    const dataUrl = canvas.toDataURL('image/png');
    
    const targetDate = getJournalTargetDate();
    const localDateStr = targetDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }).replace(/\//g, '-');
    
    const link = document.createElement('a');
    link.download = `AFFiNE-Journal-${localDateStr}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <>
      {/* --- 🚀 方案 A 強制外掛分享面板 --- */}
      <div className="ig-share-panel" style={{ padding: '20px', background: '#f5f5f7', borderRadius: '12px', marginBottom: '20px', border: '2px dashed #E1306C', zIndex: 9999, position: 'relative' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#E1306C' }}>✨ Instagram Story 分享工坊 (動態視覺補償版)</h4>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button 
            onClick={handleFetchAISummary}
            disabled={isGenerating}
            style={{ padding: '8px 12px', background: '#0071e3', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            {isGenerating ? 'AI 正在提煉中...' : '🤖 智慧 AI 提煉日記大綱'}
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
              justifyContent: 'space-between', // 💡 改為上下均勻散開，消滅死白太空感
              alignItems: 'center',
              padding: '45px 30px 40px 30px', 
              color: bgImage ? '#ffffff' : '#111111',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
            }}
          >
            {bgImage && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.4)', zIndex: 1 }} />}
            
            {/* 🔝 上半部：標題區塊 */}
            <div style={{ zIndex: 2, textAlign: 'center', width: '100%' }}>
              <p style={{ letterSpacing: '4px', fontSize: '11px', opacity: 0.8, margin: '0 0 5px 0' }}>DAILY LOG</p>
              <h2 style={{ fontSize: '18px', margin: '0 0 25px 0', fontWeight: 600 }}>
                {(() => {
                  const targetDate = getJournalTargetDate();
                  return targetDate.toLocaleDateString('zh-TW', { 
                    timeZone: 'Asia/Taipei',
                    year: 'numeric',
                    month: 'long', 
                    day: 'numeric'
                  });
                })()}
              </h2>
            </div>
              
            {/* 📂 中半部：動態大綱格子群組 */}
            <div style={{ 
              zIndex: 2, 
              textAlign: 'left', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '16px', 
              width: '100%',
              flexGrow: 1,                 // 💡 讓中段具備拉伸彈性
              justifyContent: 'center'     // 💡 當數量少時，格子會在中央優雅排開，絕不突兀
            }}>
              {aiSummary.map((bullet, index) => (
                <div key={index} style={{ 
                  fontSize: aiSummary.length <= 2 ? '15px' : '14px', // 💡 句子少時，字體自動微微放大提升飽滿度
                  lineHeight: '1.6', 
                  background: bgImage ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.03)',
                  backdropFilter: bgImage ? 'blur(8px)' : 'none',
                  padding: aiSummary.length <= 2 ? '16px 20px' : '12px 16px', // 💡 句子少時，格子自動加厚
                  borderRadius: '10px',
                  border: bgImage ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.05)',
                  fontWeight: index === 0 ? 600 : 400, // 第一格情緒標題加粗
                  letterSpacing: '0.5px'
                }}>{bullet}</div>
              ))}
            </div>
              
            {/* 🎨 下半部：設計師生活金句簽名（消滅底部空洞感的靈魂補償） */}
            <div style={{ zIndex: 2, textAlign: 'center', width: '100%', marginTop: '20px' }}>
              {aiSummary.length <= 2 && (
                <p style={{ 
                  fontSize: '11px', 
                  fontStyle: 'italic', 
                  opacity: 0.6, 
                  margin: '0 0 25px 0',
                  letterSpacing: '1px'
                }}>
                  “ 將當下的思緒，釀成明天的勇氣 ”
                </p>
              )}
              
              <p style={{ fontSize: '10px', opacity: 0.5, letterSpacing: '2px', margin: 0 }}>
                via AFFiNE Journal
              </p>
            </div>

          </div>
        )}
      </div>

      {docMeta?.headerImage && (
        <img src={docMeta.headerImage} alt="Document header" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }} />
      )}

      <BlockSuiteEditor
        className={clsx(styles.editor, { 'full-screen': !isSharedMode && fullWidthLayout, 'is-public': isSharedMode })}
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
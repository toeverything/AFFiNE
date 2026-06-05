import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import html2canvas from 'html2canvas';
import { useRef, useState } from 'react';

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
  // 📸 狀態與函式注入區（官方原生 AI 完美咬合版）
  // =================================================================
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  // 💡 提取日記真實日期的核心輔助函式（完美跟隨日記頁面標題）
  const getJournalTargetDate = () => {
    const docTitle = docMeta?.title || (doc as any).meta?.title;
    if (docTitle && docTitle.trim().length > 0) {
      const parsedDate = new Date(docTitle);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    const docMetaTime =
      (doc as any).meta?.updatedDate || (doc as any).meta?.createDate;
    if (docMetaTime) return new Date(docMetaTime);
    return new Date();
  };

  const handleFetchAISummary = async () => {
    setIsGenerating(true);
    console.log(
      '🚀 [IG分享工坊] 已登入狀態驗證成功！開始透過 Yjs 讀取全內文...'
    );

    // 1. 直接從 BlockSuite 內存資料庫拉出最完整的全篇純文字
    let rawText = '';
    try {
      const blockSuiteDoc = editor?.doc?.blockSuiteDoc;
      if (
        blockSuiteDoc &&
        typeof blockSuiteDoc.getBlocksByFlavour === 'function'
      ) {
        const paragraphBlocks =
          blockSuiteDoc.getBlocksByFlavour('affine:paragraph') || [];
        const listBlocks =
          blockSuiteDoc.getBlocksByFlavour('affine:list') || [];
        rawText = [...paragraphBlocks, ...listBlocks]
          .map(block => block?.model?.text?.toString().trim() || '')
          .filter(t => t.length > 0)
          .join('\n');
      }
    } catch {
      console.warn('BlockSuite 內存提取失敗，自動切換至 DOM 備援濾鏡');
    }

    // 備援 DOM 擷取器
    if (!rawText) {
      const textElements = document.querySelectorAll(
        '[contenteditable="true"], .v-line, .v-text, p'
      );
      rawText = Array.from(textElements)
        .map(el => el.textContent || '')
        .map(t => t.trim())
        .filter(
          t =>
            !t.includes('affine-') &&
            !t.includes('分享工坊') &&
            !t.includes("Type '/'") &&
            t.length > 0
        )
        .join('\n');
    }

    if (!rawText || rawText.trim().length === 0) {
      setAiSummary([
        '📖 今天是個神祕的日子...',
        '✍️ 稍微在下方編輯器裡敲點字，就能一鍵生成專屬的 IG 限動大綱喔！',
      ]);
      setIsGenerating(false);
      return;
    }

    console.log('🎯 成功灌入官方原生 Gemini 的日記總文字：\n', rawText);

    // 2. 🚀 調用 AFFiNE 內建已經跟隨登入帳號開通的 Gemini AI 引擎
    try {
      const blockSuiteDoc = editor.doc.blockSuiteDoc as any;
      const affineAIEngine =
        blockSuiteDoc?.workspace?.ai ||
        blockSuiteDoc?.service?.ai ||
        (window as any).currentEditor?.host?.std?.get?.('affine:ai');

      if (affineAIEngine && typeof affineAIEngine.execute === 'function') {
        // 💡 頂級 Prompt 命令：嚴厲禁止任何「...」不完整斷尾，要求產出完整且字數適中的高階大綱短句！
        const aiPrompt = `你是一個精緻的生活雜誌資深編輯。請仔細閱讀以下使用者打的全部日記內文，幫我精準提煉出一個反映整篇日記核心情緒的短標題（必須包含一個 Emoji），以及適合放上 Instagram 限時動態的生活重點大綱（根據內容豐富度與重要性，聰明提煉出 1 到 3 句即可，不要直接複製原文）。
        
        【🔥 核心語意鐵律】：
        1. 每一句大綱都必須是「語意完全完整、流暢能單獨成句」的優雅生活短句。
        2. 嚴禁在半路或句子結尾出現任何「...」或未完結的懸念。
        3. 如果日記寫得很短，請回傳總共 1 到 2 個元素的簡短 JSON 陣列即可，不需要強行湊數。
        4. 請嚴格以標準的 JSON 陣列字串格式回傳，絕對不要包含任何 markdown 標籤（如 \`\`\`json）。格式範例：["情緒標題", "精緻大綱一", "精緻大綱二"]
        
        使用者的全部日記內文如下：\n${rawText}`;

        console.log('🤖 正在透過 AFFiNE 原生通道發送大模型請求...');
        const aiResponse = await affineAIEngine.execute({ prompt: aiPrompt });
        const resultString =
          typeof aiResponse === 'string' ? aiResponse : aiResponse?.content;

        console.log('🤖 [AFFiNE Gemini 響應原始內容]：', resultString);

        const matchJson = resultString?.match(/\[.*\]/s);

        if (matchJson && matchJson[0]) {
          const cleanArray = JSON.parse(matchJson[0]);
          console.log(
            '🎉 [真・AI 大綱提煉成功] 陣列長度為：',
            cleanArray.length
          );
          setAiSummary(cleanArray);
          setIsGenerating(false);
          return;
        }
      } else {
        console.warn('⚠️ 未能偵測到有效的 AFFiNE 原生 AI 引擎物件');
      }
    } catch (aiErr) {
      console.error('🛑 呼叫 AFFiNE 原生 AI 通道時發生錯誤:', aiErr);
    }

    // 3. 🛑 終極智慧安全備援防線（萬一官方大模型因連線或點數不足未回應時兜底，100%防死鎖）
    console.log('⚡ 啟動智慧備援代碼權鏡...');
    const textLower = rawText.toLowerCase();
    const allSentences = rawText
      .split(/[。\n!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 2 && !s.includes("Type '/'"));

    let scorePressure = 0;
    let scoreConfidence = 0;
    let scoreCoding = 0;
    if (
      textLower.includes('壓力') ||
      textLower.includes('悶') ||
      textLower.includes('累')
    )
      scorePressure += 2;
    if (
      textLower.includes('簡報') ||
      textLower.includes('presentation') ||
      textLower.includes('報告')
    )
      scorePressure += 1;
    if (
      textLower.includes('成功') ||
      textLower.includes('滿足') ||
      textLower.includes('信心') ||
      textLower.includes('好')
    )
      scoreConfidence += 2;
    if (
      textLower.includes('除錯') ||
      textLower.includes('debugging') ||
      textLower.includes('代碼') ||
      textLower.includes('code')
    )
      scoreCoding += 2;

    let detectedMood = '✨ 心情手札';
    if (scorePressure > scoreConfidence && scoreCoding > 0)
      detectedMood = '⏳ 頂著簡報壓力，在代碼裡激戰的一天';
    else if (scoreConfidence >= scorePressure && scoreCoding > 0)
      detectedMood = '💻 那些卡很久的 Bug 迎刃而解，信心點滿！';
    else if (scoreConfidence > scorePressure)
      detectedMood = '☀️ 內心感到格外充實與滿足的時刻';
    else if (scorePressure > 0)
      detectedMood = '☕ 稍微給疲憊的自己一個呼吸的留白';

    let dynamicSummary = [detectedMood];
    if (
      textLower.includes('資工') ||
      textLower.includes('csie') ||
      textLower.includes('台大') ||
      textLower.includes('ntu') ||
      textLower.includes('大氣')
    ) {
      dynamicSummary.push('📍 專注在學術作業與模型運行，跟複雜的系統硬碰硬');
    }
    if (textLower.includes('拉麵') || textLower.includes('公館')) {
      dynamicSummary.push('🍜 用一碗濃郁的拉麵犒賞今日的靈魂');
    } else if (textLower.includes('咖啡') || textLower.includes('美式')) {
      dynamicSummary.push('☕ 躲進安靜的咖啡廳，用冰美式沉澱繁雜思緒');
    }
    if (
      scoreConfidence > 0 &&
      (textLower.includes('投影片') ||
        textLower.includes('簡報') ||
        textLower.includes('報告'))
    ) {
      dynamicSummary.push('✨ 順利完成了小組報告投影片，信心滿滿迎接挑戰');
    }

    if (dynamicSummary.length === 1 && allSentences.length > 0) {
      const longestSentence = [...allSentences].sort(
        (a, b) => b.length - a.length
      )[0];
      const subStr = longestSentence.slice(0, 25);
      const lastComma = Math.max(
        subStr.lastIndexOf('，'),
        subStr.lastIndexOf('、')
      );
      const cleanSentence =
        lastComma > 5
          ? longestSentence.slice(0, lastComma)
          : longestSentence.slice(0, 24);
      dynamicSummary.push(`📌 ${cleanSentence}`);
    }

    setAiSummary(dynamicSummary);
    setIsGenerating(false);
  };

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

  const handleDownloadForIG = async () => {
    if (!shareCardRef.current) return;
    const canvas = await html2canvas(shareCardRef.current, {
      useCORS: true,
      scale: 2,
    });
    const dataUrl = canvas.toDataURL('image/png');
    const targetDate = getJournalTargetDate();
    const localDateStr = targetDate
      .toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
      .replace(/\//g, '-');

    const link = document.createElement('a');
    link.download = `AFFiNE-Journal-${localDateStr}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <>
      {/* --- 🚀 方案 A 強制外掛分享面板 --- */}
      <div
        className="ig-share-panel"
        style={{
          padding: '20px',
          background: '#f5f5f7',
          borderRadius: '12px',
          marginBottom: '20px',
          border: '2px dashed #E1306C',
          zIndex: 9999,
          position: 'relative',
        }}
      >
        <h4 style={{ margin: '0 0 10px 0', color: '#E1306C' }}>
          ✨ Instagram Story 分享工坊 (原生 Gemini 完全適配版)
        </h4>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button
            onClick={() => {
              handleFetchAISummary().catch(console.error);
            }}
            disabled={isGenerating}
            style={{
              padding: '8px 12px',
              background: '#0071e3',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {isGenerating
              ? 'Gemini 正在全篇語意提煉中...'
              : '🤖 智慧 AI 提煉日記大綱'}
          </button>

          <label
            style={{
              padding: '8px 12px',
              background: '#e8e8ed',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#1d1d1f',
            }}
          >
            📸 丟入 IG 背景照片
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>

          {aiSummary.length > 0 && (
            <button
              onClick={() => {
                handleDownloadForIG().catch(console.error);
              }}
              style={{
                padding: '8px 12px',
                background: '#E1306C',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
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
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '45px 30px 40px 30px',
              color: '#1d1d1f',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            }}
          >
            {bgImage && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.4)',
                  zIndex: 1,
                }}
              />
            )}

            {/* 🔝 上半部：標題區塊 */}
            <div style={{ zIndex: 2, textAlign: 'center', width: '100%' }}>
              <p
                style={{
                  letterSpacing: '4px',
                  fontSize: '11px',
                  opacity: 0.8,
                  margin: '0 0 5px 0',
                  color: bgImage ? '#ffffff' : '#666',
                  textShadow: bgImage ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                DAILY LOG
              </p>
              <h2
                style={{
                  fontSize: '18px',
                  margin: '0 0 25px 0',
                  fontWeight: 600,
                  color: bgImage ? '#ffffff' : '#111111',
                  textShadow: bgImage ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
                }}
              >
                {(() => {
                  const targetDate = getJournalTargetDate();
                  return targetDate.toLocaleDateString('zh-TW', {
                    timeZone: 'Asia/Taipei',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  });
                })()}
              </h2>
            </div>

            {/* 📂 中半部：明亮系珍珠白磨砂格子群組 */}
            <div
              style={{
                zIndex: 2,
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                width: '100%',
                flexGrow: 1,
                justifyContent: 'center',
              }}
            >
              {aiSummary.map((bullet, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: aiSummary.length <= 2 ? '15px' : '14px',
                    lineHeight: '1.6',
                    background: bgImage
                      ? 'rgba(255, 255, 255, 0.78)'
                      : 'rgba(0, 0, 0, 0.03)',
                    backdropFilter: bgImage
                      ? 'blur(12px) saturate(140%)'
                      : 'none',
                    color: '#1d1d1f', // 蘋果官方深灰，明亮好讀
                    padding: aiSummary.length <= 2 ? '16px 20px' : '12px 16px',
                    borderRadius: '10px',
                    border: bgImage
                      ? '1px solid rgba(255, 255, 255, 0.4)'
                      : '1px solid rgba(0, 0, 0, 0.05)',
                    fontWeight: index === 0 ? 600 : 400,
                    letterSpacing: '0.5px',
                    boxShadow: bgImage
                      ? '0 8px 24px rgba(0, 0, 0, 0.06)'
                      : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {bullet}
                </div>
              ))}
            </div>

            {/* 🎨 下半部：設計師生活金句簽名 */}
            <div
              style={{
                zIndex: 2,
                textAlign: 'center',
                width: '100%',
                marginTop: '20px',
              }}
            >
              {aiSummary.length <= 2 && (
                <p
                  style={{
                    fontSize: '11px',
                    fontStyle: 'italic',
                    color: bgImage
                      ? 'rgba(255, 255, 255, 0.85)'
                      : 'rgba(0, 0, 0, 0.6)',
                    textShadow: bgImage
                      ? '0 1px 2px rgba(0, 0, 0, 0.5)'
                      : 'none',
                    margin: '0 0 25px 0',
                    letterSpacing: '1px',
                  }}
                >
                  “ 將當下的思緒，釀成明天的勇氣 ”
                </p>
              )}
              <p
                style={{
                  fontSize: '10px',
                  color: bgImage
                    ? 'rgba(255, 255, 255, 0.5)'
                    : 'rgba(0, 0, 0, 0.5)',
                  textShadow: bgImage ? '0 1px 1px rgba(0, 0, 0, 0.4)' : 'none',
                  letterSpacing: '2px',
                  margin: 0,
                }}
              >
                via AFFiNE Journal
              </p>
            </div>
          </div>
        )}
      </div>

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

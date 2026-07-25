//
//  SafariPageCapture.js
//  ShareExtension
//
//  Required by NSExtensionJavaScriptPreprocessingFile.
//  Safari only injects this when activation rule includes SupportsWebPageWithMaxCount.
//

var SafariPageCapture = function () {};

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickRoot() {
  return (
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('main') ||
    document.querySelector('#content') ||
    document.querySelector('.content') ||
    document.body ||
    document.documentElement
  );
}

function formatTimestamp(seconds) {
  var total = Math.max(0, Math.floor(Number(seconds) || 0));
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  if (h > 0) {
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return m + ':' + String(s).padStart(2, '0');
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_, num) {
      return String.fromCharCode(Number(num));
    });
}

function parseTimedTextXml(xml) {
  var lines = [];
  var regex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  var match;
  while ((match = regex.exec(xml))) {
    var attrs = match[1] || '';
    var startMatch = /start\s*=\s*"([^"]*)"/.exec(attrs);
    var start = startMatch ? Number(startMatch[1]) : 0;
    var text = decodeXmlEntities(match[2].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      lines.push({ start: start, text: text });
    }
  }
  return mergeCaptionLines(lines);
}

function parseVtt(vtt) {
  var lines = [];
  var blocks = String(vtt || '').split(/\n\n+/);
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i].trim();
    if (!block || block.indexOf('WEBVTT') === 0 || block.indexOf('NOTE') === 0) {
      continue;
    }
    var blockLines = block.split('\n');
    var timeLine = null;
    for (var j = 0; j < blockLines.length; j++) {
      if (blockLines[j].indexOf('-->') !== -1) {
        timeLine = blockLines[j];
        break;
      }
    }
    if (!timeLine) continue;
    var startToken = timeLine.split(/\s+/)[0] || '0:00:00.000';
    var parts = startToken.split(':');
    var start = 0;
    if (parts.length === 3) {
      start = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    } else if (parts.length === 2) {
      start = Number(parts[0]) * 60 + Number(parts[1]);
    }
    var text = blockLines
      .slice(blockLines.indexOf(timeLine) + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      lines.push({ start: start, text: text });
    }
  }
  return mergeCaptionLines(lines);
}

function mergeCaptionLines(lines) {
  var merged = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var last = merged[merged.length - 1];
    if (
      last &&
      line.start - last.start < 4.5 &&
      !/[.!?]$/.test(last.text) &&
      last.text.length + line.text.length < 280
    ) {
      last.text = (last.text + ' ' + line.text).replace(/\s+/g, ' ').trim();
    } else {
      merged.push({ start: line.start, text: line.text });
    }
  }
  return merged;
}

function textValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return normalizeText(value);
  if (value.simpleText) return normalizeText(value.simpleText);
  if (value.runs && value.runs.length) {
    return normalizeText(
      value.runs
        .map(function (run) {
          return run.text || '';
        })
        .join('')
    );
  }
  return '';
}

function parseTimestampText(value) {
  var parts = String(value || '')
    .split(':')
    .map(function (part) {
      return Number(part);
    })
    .filter(function (part) {
      return !Number.isNaN(part);
    });
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function extractChaptersFromValue(value, chapters) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) extractChaptersFromValue(value[i], chapters);
    return;
  }
  if (typeof value !== 'object') return;

  var chapterRenderer = value.chapterRenderer || value;
  if (chapterRenderer && chapterRenderer.timeRangeStartMillis !== undefined) {
    var chapterTitle = textValue(chapterRenderer.title);
    if (chapterTitle) {
      chapters.push({
        start: Number(chapterRenderer.timeRangeStartMillis || 0) / 1000,
        title: chapterTitle,
      });
    }
  }

  var macro = value.macroMarkersListItemRenderer;
  if (macro) {
    var macroTitle = textValue(macro.title);
    var macroTime = textValue(macro.timeDescription);
    if (macroTitle && macroTime) {
      chapters.push({ start: parseTimestampText(macroTime), title: macroTitle });
    }
  }

  Object.keys(value).forEach(function (key) {
    extractChaptersFromValue(value[key], chapters);
  });
}

function readYouTubeInitialData() {
  try {
    if (typeof ytInitialData !== 'undefined' && ytInitialData) return ytInitialData;
  } catch (error) {}
  return null;
}

function extractChapters() {
  var initialData = readYouTubeInitialData();
  var chapters = [];
  extractChaptersFromValue(initialData, chapters);
  var seen = Object.create(null);
  return chapters
    .filter(function (chapter) {
      return chapter.title;
    })
    .sort(function (a, b) {
      return a.start - b.start;
    })
    .filter(function (chapter) {
      var key = Math.round(chapter.start) + ':' + chapter.title.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function formatTranscript(lines, chapters) {
  chapters = (chapters || []).sort(function (a, b) {
    return a.start - b.start;
  });
  var chapterIndex = 0;
  var lastChapterTitle = '';
  var parts = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    while (
      chapterIndex < chapters.length &&
      chapters[chapterIndex].start <= line.start + 0.5
    ) {
      var chapter = chapters[chapterIndex++];
      if (chapter.title !== lastChapterTitle) {
        parts.push('### ' + chapter.title);
        lastChapterTitle = chapter.title;
      }
    }
    parts.push(formatTimestamp(line.start) + ' ' + line.text);
  }
  return parts.join('\n\n');
}

function selectCaptionTrack(tracks) {
  if (!tracks || !tracks.length) return null;
  var preferred = ['en', 'en-us', 'en-gb', 'zh-hans', 'zh-cn', 'zh-hant', 'zh-tw', 'zh'];
  var manual = tracks.filter(function (t) {
    return t.kind !== 'asr';
  });
  var asr = tracks.filter(function (t) {
    return t.kind === 'asr';
  });
  function matchLang(list, lang) {
    return list.find(function (t) {
      var code = String(t.languageCode || '').toLowerCase();
      return code === lang || code.indexOf(lang + '-') === 0;
    });
  }
  for (var i = 0; i < preferred.length; i++) {
    var hit = matchLang(manual, preferred[i]);
    if (hit) return hit;
  }
  if (manual[0]) return manual[0];
  for (var j = 0; j < preferred.length; j++) {
    var asrHit = matchLang(asr, preferred[j]);
    if (asrHit) return asrHit;
  }
  return asr[0] || tracks[0];
}

function fetchText(url) {
  return fetch(url, { credentials: 'include' }).then(function (response) {
    if (!response.ok) {
      throw new Error('fetch failed');
    }
    return response.text();
  });
}

function loadYouTubeTranscript(track, chapters) {
  if (!track || !track.baseUrl) {
    return Promise.resolve('');
  }
  var base = String(track.baseUrl).replace(/\\u0026/g, '&');
  var candidates = [base];
  if (base.indexOf('fmt=') === -1) {
    candidates.push(base + '&fmt=vtt');
    candidates.push(base + '&fmt=srv3');
  }

  var index = 0;
  function next() {
    if (index >= candidates.length) {
      return Promise.resolve('');
    }
    var url = candidates[index++];
    return fetchText(url)
      .then(function (body) {
        if (!body || !String(body).trim()) {
          return next();
        }
        var lines = body.indexOf('<text') !== -1 ? parseTimedTextXml(body) : parseVtt(body);
        if (!lines.length) {
          return next();
        }
        return formatTranscript(lines, chapters);
      })
      .catch(function () {
        return next();
      });
  }
  return next();
}

function readYouTubePlayer() {
  try {
    if (typeof ytInitialPlayerResponse === 'undefined' || !ytInitialPlayerResponse) {
      return null;
    }
    return ytInitialPlayerResponse;
  } catch (error) {
    return null;
  }
}

function hostnameOf(value) {
  try {
    var link = document.createElement('a');
    link.href = value || '';
    return String(link.hostname || '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function isXPostURL(value) {
  var host = hostnameOf(value);
  if (host !== 'x.com' && host !== 'mobile.x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') {
    return false;
  }
  try {
    var link = document.createElement('a');
    link.href = value || '';
    return /\/status\/(\d+)/.test(link.pathname || '');
  } catch (error) {
    return false;
  }
}

function metaContent(name) {
  var selectors = [
    'meta[property="' + name + '"]',
    'meta[name="' + name + '"]',
  ];
  for (var i = 0; i < selectors.length; i++) {
    var node = document.querySelector(selectors[i]);
    var content = node && node.getAttribute('content');
    if (content) return normalizeText(content);
  }
  return '';
}

function linesFromElement(element) {
  return normalizeText((element && (element.innerText || element.textContent)) || '')
    .split('\n')
    .map(function (line) {
      return normalizeText(line);
    })
    .filter(Boolean);
}

function pickXPostArticle(url) {
  var articles = Array.prototype.slice.call(document.querySelectorAll('article'));
  if (!articles.length) return null;
  var statusMatch = String(url || '').match(/\/status\/(\d+)/);
  var statusId = statusMatch && statusMatch[1];
  for (var i = 0; i < articles.length; i++) {
    var article = articles[i];
    if (statusId && article.querySelector('a[href*="/status/' + statusId + '"]')) {
      return article;
    }
  }
  for (var j = 0; j < articles.length; j++) {
    if (articles[j].querySelector('[data-testid="tweetText"]')) {
      return articles[j];
    }
  }
  return articles[0];
}

function extractXAuthor(article) {
  var userNode = article && article.querySelector('[data-testid="User-Name"]');
  var lines = linesFromElement(userNode);
  var displayName = '';
  var handle = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!handle && /^@/.test(line)) {
      handle = line;
      continue;
    }
    if (!displayName && line !== 'Follow' && line !== '·' && !/^@/.test(line)) {
      displayName = line.replace(/\s*✔\s*$/, '').trim();
    }
  }
  if (!displayName) {
    var title = metaContent('og:title') || document.title || '';
    var titleMatch = title.match(/^(.+?)\s+on\s+X:/i);
    displayName = titleMatch ? normalizeText(titleMatch[1]) : '';
  }
  return { displayName: displayName, handle: handle };
}

function extractXTweetText(article) {
  var textNode = article && article.querySelector('[data-testid="tweetText"]');
  if (textNode) {
    var text = normalizeText(textNode.innerText || textNode.textContent || '');
    if (text) return text;
  }
  var description = metaContent('og:description') || metaContent('description');
  if (description) return description;

  var lines = linesFromElement(article);
  var start = 0;
  for (var i = 0; i < lines.length; i++) {
    if (/^@/.test(lines[i])) start = i + 1;
  }
  var body = [];
  for (var j = start; j < lines.length; j++) {
    var line = lines[j];
    if (
      line === 'Follow' ||
      line === 'Post' ||
      line === '·' ||
      /^\d+:\d{2}$/.test(line) ||
      /\bViews$/i.test(line) ||
      /\b\d{4}\b/.test(line)
    ) {
      continue;
    }
    if (/^\d+(\.\d+)?[KMB]?$/.test(line)) break;
    body.push(line);
  }
  return normalizeText(body.join('\n'));
}

function absoluteURL(value) {
  if (!value) return '';
  try {
    var link = document.createElement('a');
    link.href = String(value).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    return link.href || '';
  } catch (error) {
    return '';
  }
}

function mediaURLFromElement(element) {
  if (!element) return '';
  if (String(element.tagName || '').toUpperCase() === 'VIDEO') {
    return absoluteURL(element.getAttribute('poster') || element.poster || '');
  }
  return absoluteURL(element.currentSrc || element.src || element.getAttribute('src') || '');
}

function videoURLFromElement(element) {
  if (!element) return '';
  var url = absoluteURL(element.currentSrc || element.src || element.getAttribute('src') || '');
  if (url && url.indexOf('blob:') !== 0) return url;
  var source = element.querySelector && element.querySelector('source[src]');
  url = absoluteURL(source && source.getAttribute('src'));
  return url && url.indexOf('blob:') !== 0 ? url : '';
}

function extractXVideoDuration(article, video) {
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    return formatTimestamp(video.duration);
  }
  var lines = linesFromElement(article);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(line)) {
      return line;
    }
  }
  return '';
}

function extractXMedia(article) {
  var elements = Array.prototype.slice.call(
    (article || document).querySelectorAll('video, img')
  );
  var candidates = elements
    .map(function (element) {
      var tag = String(element.tagName || '').toUpperCase();
      var previewURL = mediaURLFromElement(element);
      var videoURL = tag === 'VIDEO' ? videoURLFromElement(element) : '';
      var likelyVideo = /ext_tw_video_thumb|amplify_video_thumb/.test(previewURL);
      var type = tag === 'VIDEO' || likelyVideo ? 'video' : 'image';
      var width = element.naturalWidth || element.videoWidth || element.clientWidth || 0;
      var height = element.naturalHeight || element.videoHeight || element.clientHeight || 0;
      return {
        type: type,
        previewURL: previewURL,
        videoURL: videoURL,
        duration: type === 'video' ? extractXVideoDuration(article, element) : '',
        score: width * height,
      };
    })
    .filter(function (candidate) {
      var url = candidate.previewURL || candidate.videoURL || '';
      if (!url) return false;
      if (/profile_images|emoji|avatar|abs\.twimg\.com/.test(url)) return false;
      return /pbs\.twimg\.com\/(media|ext_tw_video_thumb|amplify_video_thumb|card_img)/.test(url)
        || candidate.type === 'video';
    })
    .sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'video' ? -1 : 1;
      return b.score - a.score;
    });
  if (candidates[0]) return candidates[0];

  var ogVideo = metaContent('og:video') || metaContent('og:video:url') || metaContent('twitter:player:stream');
  var ogImage = metaContent('og:image');
  if (ogVideo) {
    return {
      type: 'video',
      previewURL: /profile_images|emoji|avatar/.test(ogImage) ? '' : ogImage,
      videoURL: ogVideo,
      duration: '',
      score: 0,
    };
  }
  return {
    type: 'image',
    previewURL: /profile_images|emoji|avatar/.test(ogImage) ? '' : ogImage,
    videoURL: '',
    duration: '',
    score: 0,
  };
}

function parseSrtTimestamp(value) {
  var parts = String(value || '').replace(',', '.').split(':');
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(parts[0]) || 0;
}

function parseSrt(srt) {
  var lines = [];
  var blocks = String(srt || '').replace(/\r/g, '').split(/\n\n+/);
  for (var i = 0; i < blocks.length; i++) {
    var blockLines = blocks[i].split('\n').map(function (line) {
      return line.trim();
    });
    var timeIndex = blockLines.findIndex(function (line) {
      return line.indexOf('-->') !== -1;
    });
    if (timeIndex < 0) continue;
    var start = parseSrtTimestamp(blockLines[timeIndex].split('-->')[0].trim());
    var text = blockLines
      .slice(timeIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) lines.push({ start: start, text: text });
  }
  return mergeCaptionLines(lines);
}

function parseCaptionBody(body) {
  var text = String(body || '');
  if (!text.trim()) return [];
  if (text.indexOf('<text') !== -1) return parseTimedTextXml(text);
  if (/WEBVTT|-->/.test(text) && text.indexOf(',') === -1) return parseVtt(text);
  return parseSrt(text);
}

function linesFromTextTracks(article) {
  var lines = [];
  var videos = Array.prototype.slice.call((article || document).querySelectorAll('video'));
  for (var i = 0; i < videos.length; i++) {
    var tracks = videos[i].textTracks || [];
    for (var j = 0; j < tracks.length; j++) {
      try {
        if (tracks[j].mode === 'disabled') tracks[j].mode = 'hidden';
        var cues = tracks[j].cues || [];
        for (var k = 0; k < cues.length; k++) {
          var cue = cues[k];
          var text = normalizeText(cue.text || '');
          if (text) lines.push({ start: Number(cue.startTime) || 0, text: text });
        }
      } catch (error) {}
    }
  }
  return mergeCaptionLines(lines);
}

function extractCaptionURLsFromScripts() {
  var urls = [];
  var scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
  var regex = /https?:\\?\/\\?\/[^"'<>\s]+?(?:\.vtt|\.srt)[^"'<>\s]*/gi;
  for (var i = 0; i < scripts.length; i++) {
    var text = scripts[i].textContent || '';
    if (text.indexOf('.vtt') === -1 && text.indexOf('.srt') === -1) continue;
    var match;
    while ((match = regex.exec(text))) {
      urls.push(
        absoluteURL(match[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&'))
      );
    }
  }
  return urls;
}

function extractXCaptionURLs(article) {
  var urls = Array.prototype.slice.call((article || document).querySelectorAll('track[src]'))
    .map(function (track) {
      return absoluteURL(track.getAttribute('src'));
    })
    .filter(Boolean)
    .concat(extractCaptionURLsFromScripts());
  var seen = Object.create(null);
  return urls.filter(function (url) {
    if (!url || seen[url]) return false;
    seen[url] = true;
    return true;
  });
}

function loadXVideoTranscript(article) {
  var directLines = linesFromTextTracks(article);
  if (directLines.length) {
    return Promise.resolve(formatTranscript(directLines, []));
  }
  var urls = extractXCaptionURLs(article);
  var index = 0;
  function next() {
    if (index >= urls.length) return Promise.resolve('');
    return fetchText(urls[index++])
      .then(function (body) {
        var lines = parseCaptionBody(body);
        return lines.length ? formatTranscript(lines, []) : next();
      })
      .catch(function () {
        return next();
      });
  }
  return next();
}

function withTimeout(promise, milliseconds, fallback) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, milliseconds);
    promise
      .then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function extractXTimestamp(article) {
  var timeNode = article && article.querySelector('time');
  var timeText = normalizeText((timeNode && timeNode.innerText) || '');
  var lines = linesFromElement(article);
  var fullTime = lines.find(function (line) {
    return /\b\d{1,2}:\d{2}\s*(AM|PM)\b.*\b\d{4}\b/i.test(line);
  });
  var views = '';
  for (var i = 0; i < lines.length; i++) {
    if (/^Views$/i.test(lines[i]) && i > 0) {
      views = lines[i - 1] + ' Views';
      break;
    }
    if (/\bViews$/i.test(lines[i])) {
      views = lines[i];
      break;
    }
  }
  return [fullTime || timeText, views].filter(Boolean).join(' · ');
}

function extractXMetrics(article) {
  function metric(testId, label) {
    var node = article && article.querySelector('[data-testid="' + testId + '"]');
    var raw = normalizeText(
      (node && (node.getAttribute('aria-label') || node.innerText || node.textContent)) || ''
    );
    var match = raw.match(/([\d,.]+\s*[KMB]?)/i);
    return match ? match[1].replace(/\s+/g, '') + ' ' + label : '';
  }

  var metrics = [
    metric('reply', 'Replies'),
    metric('retweet', 'Reposts'),
    metric('like', 'Likes'),
    metric('bookmark', 'Bookmarks'),
  ].filter(Boolean);
  if (metrics.length) return metrics;

  var lines = linesFromElement(article);
  var viewsIndex = lines.findIndex(function (line) {
    return /^Views$/i.test(line) || /\bViews$/i.test(line);
  });
  if (viewsIndex < 0) return [];
  var labels = ['Replies', 'Reposts', 'Likes', 'Bookmarks'];
  var values = lines.slice(viewsIndex + 1).filter(function (line) {
    return /^[\d,.]+[KMB]?$/i.test(line);
  });
  return values.slice(0, 4).map(function (value, index) {
    return value + ' ' + labels[index];
  });
}

function buildXPostPayload(article, url, videoTranscript) {
  var author = extractXAuthor(article);
  var tweetText = extractXTweetText(article);
  var media = extractXMedia(article);
  var timestamp = extractXTimestamp(article);
  var metrics = extractXMetrics(article);
  var title = metaContent('og:title') || document.title || 'X Post';

  var parts = [];
  if (author.displayName || author.handle) {
    parts.push(
      ['**' + (author.displayName || 'X') + '**', author.handle]
        .filter(Boolean)
        .join('\n')
    );
  }
  if (media.previewURL) {
    var alt = media.type === 'video' ? 'Tweet video cover' : 'Tweet media';
    parts.push('![' + alt + '](' + media.previewURL + ')');
  }
  if (tweetText) parts.push(tweetText);
  if (media.type === 'video') {
    var videoInfo = ['Video'];
    if (media.duration) videoInfo.push('Duration: ' + media.duration);
    parts.push(videoInfo.join(' · '));
    if (media.videoURL) parts.push('[Open video](' + media.videoURL + ')');
    parts.push(
      videoTranscript
        ? '## Video timeline\n\n' + videoTranscript
        : '## Video timeline\n\nNo captions or timeline metadata exposed by X for this video.'
    );
  }
  if (timestamp) parts.push(timestamp);
  if (metrics.length) parts.push(metrics.join(' · '));

  return {
    title: normalizeText(title),
    url: url,
    content: parts.join('\n\n'),
    description: tweetText,
    mediaURL: media.previewURL,
    mediaType: media.type,
    videoURL: media.videoURL,
    sourceType: 'x-post',
  };
}

function captureXPost() {
  var url =
    document.URL ||
    (typeof location !== 'undefined' ? location.href : '') ||
    '';
  if (!isXPostURL(url)) return null;

  var article = pickXPostArticle(url);
  var payload = buildXPostPayload(article, url, '');
  return { article: article, payload: payload };
}

function captureGeneric() {
  var title = normalizeText(document.title);
  var url =
    document.URL ||
    (typeof location !== 'undefined' ? location.href : '') ||
    '';

  var selection = '';
  try {
    selection = normalizeText(
      window.getSelection && window.getSelection().toString()
    );
  } catch (selectionError) {
    selection = '';
  }

  var root = pickRoot();
  var content = selection;
  if (!content || content.length < 80) {
    content = normalizeText((root && (root.innerText || root.textContent)) || '');
  }
  if (!content || content.length < 80) {
    content = normalizeText(
      (document.documentElement && document.documentElement.innerText) || ''
    );
  }

  var meta = document.querySelector('meta[name="description"]');
  var description = meta && meta.getAttribute('content');
  if ((!content || content.length < 40) && description) {
    content = normalizeText(description);
  }

  var maxLen = 120000;
  if (content.length > maxLen) {
    content = content.substring(0, maxLen) + '\n\n…';
  }

  return {
    title: title,
    url: url,
    content: content,
    description: description ? normalizeText(description) : '',
  };
}

SafariPageCapture.prototype = {
  run: function (extensionArguments) {
    var complete = extensionArguments.completionFunction;
    try {
      var xPost = captureXPost();
      if (xPost) {
        if (xPost.payload.mediaType === 'video') {
          withTimeout(loadXVideoTranscript(xPost.article), 1800, '')
            .then(function (transcript) {
              complete(buildXPostPayload(xPost.article, xPost.payload.url, transcript));
            })
            .catch(function () {
              complete(xPost.payload);
            });
        } else {
          complete(xPost.payload);
        }
        return;
      }

      var player = readYouTubePlayer();
      if (player && player.videoDetails) {
        var details = player.videoDetails || {};
        var title = normalizeText(details.title || document.title || '');
        var url =
          document.URL ||
          (typeof location !== 'undefined' ? location.href : '') ||
          '';
        var description = normalizeText(details.shortDescription || '');
        var tracks =
          (((player.captions || {}).playerCaptionsTracklistRenderer || {})
            .captionTracks) || [];
        var selected = selectCaptionTrack(tracks);
        var chapters = extractChapters();

        loadYouTubeTranscript(selected, chapters)
          .then(function (transcript) {
            complete({
              title: title,
              url: url,
              content: description,
              description: description,
              transcript: transcript || '',
            });
          })
          .catch(function () {
            complete({
              title: title,
              url: url,
              content: description,
              description: description,
              transcript: '',
            });
          });
        return;
      }

      complete(captureGeneric());
    } catch (error) {
      complete({
        title: (document && document.title) || '',
        url: (document && document.URL) || '',
        content: '',
        error: String(error),
      });
    }
  },

  // Required by Apple sample shape for iOS share/action extensions.
  finalize: function () {},
};

var ExtensionPreprocessingJS = new SafariPageCapture();

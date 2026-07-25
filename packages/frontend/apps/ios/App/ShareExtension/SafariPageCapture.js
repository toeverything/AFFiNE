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
  run: function (arguments) {
    var complete = arguments.completionFunction;
    try {
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

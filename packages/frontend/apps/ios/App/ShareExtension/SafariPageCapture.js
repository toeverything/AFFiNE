var SafariPageCapture = function () {};

var MAX_CONTENT_CHARS = 120000;
var MAX_TRANSCRIPT_CHARS = 80000;
var TRANSCRIPT_TIMEOUT_MS = 1500;

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function meta(name) {
  var selector =
    'meta[name="' +
    name +
    '"],meta[property="' +
    name +
    '"],meta[itemprop="' +
    name +
    '"]';
  var node = document.querySelector(selector);
  return normalizeText(node && node.getAttribute('content'));
}

function pickMainRoot() {
  return (
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('main') ||
    document.querySelector('#content') ||
    document.body ||
    document.documentElement
  );
}

function pageContent() {
  var root = pickMainRoot();
  if (!root) return '';
  var clone = root.cloneNode(true);
  Array.prototype.forEach.call(
    clone.querySelectorAll('script,style,noscript,svg,canvas,iframe'),
    function (node) {
      node.remove();
    }
  );
  return normalizeText(clone.innerText || clone.textContent).slice(
    0,
    MAX_CONTENT_CHARS
  );
}

function formatTimestamp(seconds) {
  var total = Math.max(0, Math.floor(Number(seconds) || 0));
  var hours = Math.floor(total / 3600);
  var minutes = Math.floor((total % 3600) / 60);
  var remainder = total % 60;
  if (hours > 0) {
    return (
      hours +
      ':' +
      String(minutes).padStart(2, '0') +
      ':' +
      String(remainder).padStart(2, '0')
    );
  }
  return minutes + ':' + String(remainder).padStart(2, '0');
}

function decodeEntities(value) {
  var textarea = document.createElement('textarea');
  textarea.innerHTML = String(value || '');
  return textarea.value;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function mergeCaptionLines(lines) {
  var merged = [];
  lines.forEach(function (line) {
    var last = merged[merged.length - 1];
    if (
      last &&
      line.start - last.start < 4.5 &&
      !/[.!?]$/.test(last.text) &&
      last.text.length + line.text.length < 280
    ) {
      last.text = normalizeText(last.text + ' ' + line.text);
    } else {
      merged.push({ start: line.start, text: line.text });
    }
  });
  return merged;
}

function parseTimedText(xml) {
  var lines = [];
  var regex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  var match;
  while ((match = regex.exec(xml))) {
    var startMatch = /start\s*=\s*"([^"]*)"/.exec(match[1] || '');
    var text = normalizeText(decodeEntities(stripTags(match[2])));
    if (text) lines.push({ start: Number(startMatch && startMatch[1]) || 0, text: text });
  }
  return mergeCaptionLines(lines);
}

function parseVtt(vtt) {
  var lines = [];
  String(vtt || '')
    .split(/\n\n+/)
    .forEach(function (block) {
      var rows = block.trim().split('\n');
      var timeLine = rows.find(function (row) {
        return row.indexOf('-->') !== -1;
      });
      if (!timeLine) return;
      var parts = (timeLine.split(/\s+/)[0] || '0:00').split(':').map(Number);
      var start =
        parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + parts[1];
      var text = normalizeText(stripTags(rows.slice(rows.indexOf(timeLine) + 1).join(' ')));
      if (text) lines.push({ start: start, text: text });
    });
  return mergeCaptionLines(lines);
}

function textValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return normalizeText(value);
  if (value.simpleText) return normalizeText(value.simpleText);
  if (Array.isArray(value.runs)) {
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

function playerResponse() {
  if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
  var scripts = Array.prototype.slice.call(document.scripts || []);
  for (var i = 0; i < scripts.length; i++) {
    var text = scripts[i].textContent || '';
    var marker = 'ytInitialPlayerResponse = ';
    var start = text.indexOf(marker);
    if (start === -1) continue;
    start += marker.length;
    var end = text.indexOf(';</script>', start);
    if (end === -1) end = text.indexOf(';var', start);
    if (end === -1) end = text.length;
    try {
      return JSON.parse(text.slice(start, end));
    } catch (error) {}
  }
  return null;
}

function fetchTranscript(response) {
  var tracks =
    response &&
    response.captions &&
    response.captions.playerCaptionsTracklistRenderer &&
    response.captions.playerCaptionsTracklistRenderer.captionTracks;
  if (!tracks || !tracks.length) return Promise.resolve('');
  var track =
    tracks.find(function (item) {
      return item.languageCode && item.languageCode.indexOf('en') === 0;
    }) || tracks[0];
  var url = track && track.baseUrl;
  if (!url) return Promise.resolve('');
  var request = fetch(url + '&fmt=vtt', { credentials: 'omit' })
    .then(function (response) {
      if (!response.ok) throw new Error('caption unavailable');
      return response.text();
    })
    .then(function (body) {
      var lines = body.indexOf('WEBVTT') === 0 ? parseVtt(body) : parseTimedText(body);
      return lines
        .map(function (line) {
          return formatTimestamp(line.start) + ' ' + line.text;
        })
        .join('\n')
        .slice(0, MAX_TRANSCRIPT_CHARS);
    })
    .catch(function () {
      return '';
    });
  var timeout = new Promise(function (resolve) {
    setTimeout(function () {
      resolve('');
    }, TRANSCRIPT_TIMEOUT_MS);
  });
  return Promise.race([request, timeout]);
}

function youtubeFields() {
  var response = playerResponse();
  var details = (response && response.videoDetails) || {};
  var microformat =
    response &&
    response.microformat &&
    response.microformat.playerMicroformatRenderer;
  var description =
    textValue(microformat && microformat.description) ||
    normalizeText(details.shortDescription) ||
    meta('description') ||
    meta('og:description');
  var thumbnail = '';
  var thumbnails = details.thumbnail && details.thumbnail.thumbnails;
  if (Array.isArray(thumbnails) && thumbnails.length) {
    thumbnail = thumbnails[thumbnails.length - 1].url || '';
  }
  return fetchTranscript(response).then(function (transcript) {
    return {
      title: normalizeText(details.title) || document.title || '',
      description: description,
      content: description || pageContent(),
      transcript: transcript,
      thumbnailURL: thumbnail,
    };
  });
}

function isYouTube() {
  return /(^|\.)youtube\.com$/.test(location.hostname) || location.hostname === 'youtu.be';
}

function isXPost() {
  return /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(location.hostname);
}

SafariPageCapture.prototype = {
  run: function (context) {
    var selection = window.getSelection();
    var base = {
      title: document.title || meta('og:title') || '',
      url: document.location.href,
      selectedText: selection ? normalizeText(selection.toString()) : '',
      description: meta('description') || meta('og:description'),
      content: isXPost()
        ? normalizeText((document.querySelector('article') || {}).innerText)
        : pageContent(),
      sourceType: isXPost() ? 'x-post' : 'webpage',
    };
    var finish = function (extra) {
      context.completionFunction(Object.assign(base, extra || {}));
    };
    if (isYouTube()) {
      youtubeFields().then(finish, function () {
        finish({ sourceType: 'youtube' });
      });
    } else {
      finish({});
    }
  },
};

var ExtensionPreprocessingJS = new SafariPageCapture();

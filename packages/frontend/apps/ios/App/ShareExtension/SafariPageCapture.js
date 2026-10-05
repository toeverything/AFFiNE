var SafariPageCapture = function () {};

SafariPageCapture.prototype = {
  run: function (context) {
    var selection = window.getSelection();
    context.completionFunction({
      title: document.title || '',
      url: document.location.href,
      selectedText: selection ? selection.toString() : '',
    });
  },
};

var ExtensionPreprocessingJS = new SafariPageCapture();

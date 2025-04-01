//
//  App.swift
//  Example
//
//  Created by 秋星桥 on 1/20/25.
//

import SwiftUI

@main
struct TheApp: App {
  var body: some Scene {
    WindowGroup {
      NavigationView {
        Content()
          .navigationTitle("MarkdownView")
          .navigationBarTitleDisplayMode(.inline)
      }
      .navigationViewStyle(.stack)
    }
  }
}

import MarkdownParser
import MarkdownView

class ContentController: UIViewController {
  let document = MarkdownParser().feed(testDocument)
  let scrollView = UIScrollView()
  let markdownView = MarkdownView(theme: .default)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.addSubview(scrollView)
    scrollView.addSubview(markdownView)
  }

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    scrollView.frame = view.bounds
    let width = view.bounds.width - 32
    let manifest = document.map {
      let manifest = $0.manifest(theme: markdownView.theme)
      manifest.setLayoutWidth(width)
      manifest.layoutIfNeeded()
      return manifest
    }
    markdownView.updateContentViews(manifest)
    markdownView.frame = .init(
      x: 16,
      y: 16,
      width: width,
      height: markdownView.height
    )
    scrollView.contentSize = .init(
      width: width,
      height: markdownView.height + 100
    )
  }
}

struct Content: UIViewControllerRepresentable {
  func makeUIViewController(context _: Context) -> ContentController {
    ContentController()
  }

  func updateUIViewController(_: ContentController, context _: Context) {}
}

let testDocument = ###"""
# Markdown 测试文稿

这是一篇用于测试渲染引擎性能的 Markdown 文档，包含多种格式和元素。以下是不同 Markdown 语法的示例：

## 标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

## 段落与文本格式

这是一个普通段落。**这是加粗的文字**，*这是斜体的文字*，***这是加粗且斜体的文字***。~~这是删除线~~。

这是`行内代码`的示例。

## 列表

### 无序列表

- 项目 1
- 项目 2
  - 子项目 2.1
  - 子项目 2.2
- 项目 3

### 有序列表

1. 第一项
2. 第二项
   1. 子项 2.1
   2. 子项 2.2
3. 第三项

## 引用

> 这是一个引用块。引用块可以包含多行文字，甚至可以包含其他 Markdown 元素，比如**加粗**或`代码`。

## 代码块

```python
def hello_world():
    print("Hello, World!")
```

```javascript
function helloWorld() {
    console.log("Hello, World!");
}
```

## 表格

| 序号 | 名称       | 描述          |
| ---- | ---------- | ------------- |
| 1    | 项目 A     | 这是项目 A    |
| 2    | 项目 B     | 这是项目 B    |
| 3    | 项目 C     | 这是项目 C    |

## 链接与图片

这是一个[短链接](https://example.com)的示例。

![图片描述](https://via.placeholder.com/150)

## HTML 嵌入

<p style="color: red;">这是一个红色的段落，使用 HTML 标签实现。</p>

<a href="https://example.com">这是一个短链接</a>

## 分隔线

---

## 脚注

这是一个脚注的示例[^1]。

[^1]: 这是脚注的内容。

## 内嵌 HTML

<div style="border: 1px solid black; padding: 10px;">
  这是一个带有边框的 HTML 块。
</div>

## 数学公式（如果支持）

这是一个行内公式：$E = mc^2$。

这是一个块级公式：
$$
\int_{a}^{b} x^2 dx
$$

## 任务列表

- [x] 完成任务 1
- [ ] 完成任务 2
- [ ] 完成任务 3

## 结束语

这篇文档包含了多种 Markdown 格式和 HTML 元素，适合用于测试渲染引擎的性能和兼容性。希望它能帮助你完成测试！
"""###

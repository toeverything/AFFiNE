# ChidoriMenu 🐦⚡️

A seamless drop-in replacement for UIMenu & UIAction, featuring nested menu support and dark mode compatibility.

The inspiration behind this project stems from Apple's lack of a unified interface across iOS and Mac Catalyst apps, as well as the absence of a built-in menu presentation method. To address these gaps—and to enable greater customization—we developed ChidoriMenu.

This project draws heavily on code from [ChidoriMenu](https://github.com/christianselig/ChidoriMenu), and as such, we adhere to the same license.

## Preview

![Screenshot](./Resources/IMG_4262.JPG)

## Features

- [x] Added support for UIMenu & UIAction
- [x] Added drop-in replacement for `_presentMenuAtLocation:` (not recommended for general use)
- [x] Added support for nested menus in child elements
- [x] Added support for the `.displayInline` menu option
- [x] Added compatibility with dark mode
- [x] Fixed scrolling issues during selection
- [x] Fixed multiple actions triggering simultaneously
- [ ] Added support for UIDeferredMenuElement (Contributions Welcome!)

## Requirements

- iOS 15.0 or later
- macCatalyst 15.0 or later

## Usage

Getting started is straightforward. While the interface differs slightly from Apple's menu implementation, the core principles remain the same. Mac Catalyst is fully supported, though it does not bridge to AppKit menus—it functions identically to iOS.

```swift
UIButton.presentMenu()
UIView.present(menu: menu)
```

For detailed examples, check out the example project included in the repository.

## License

ChidoriMenu is available under the MIT license. See the LICENSE file for more info.

---

2025.1.20 - Made with ❤️ by Lakr233

import Foundation
import Capacitor

private func resolveLocalFontDir(from fontURL: String) -> String? {
  let path: String
  if fontURL.hasPrefix("file://") {
    guard let url = URL(string: fontURL), url.isFileURL else {
      return nil
    }
    path = url.path
  } else {
    let candidate = (fontURL as NSString).standardizingPath
    guard candidate.hasPrefix("/") else {
      return nil
    }
    path = candidate
  }

  var isDirectory: ObjCBool = false
  if FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory),
     isDirectory.boolValue
  {
    return path
  }

  let directory = (path as NSString).deletingLastPathComponent
  return directory.isEmpty ? nil : directory
}

private func resolveTypstFontDirs(from options: [AnyHashable: Any]?) throws -> [String]? {
  guard let rawFontUrls = options?["fontUrls"] else {
    return nil
  }

  guard let fontUrls = rawFontUrls as? [Any] else {
    throw NSError(
      domain: "PreviewPlugin",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey: "Typst preview fontUrls must be an array of strings."
      ]
    )
  }

  var seenFontDirs = Set<String>()
  var orderedFontDirs = [String]()
  orderedFontDirs.reserveCapacity(fontUrls.count)

  for fontUrl in fontUrls {
    guard let fontURL = fontUrl as? String else {
      throw NSError(
        domain: "PreviewPlugin",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey: "Typst preview fontUrls must be strings."
        ]
      )
    }

    guard let fontDir = resolveLocalFontDir(from: fontURL) else {
      throw NSError(
        domain: "PreviewPlugin",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey: "Typst preview on mobile only supports local font file URLs or absolute font directories."
        ]
      )
    }

    if seenFontDirs.insert(fontDir).inserted {
      orderedFontDirs.append(fontDir)
    }
  }

  return orderedFontDirs
}

@objc(PreviewPlugin)
public class PreviewPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "PreviewPlugin"
  public let jsName = "Preview"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "renderMermaidSvg", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "renderTypstSvg", returnType: CAPPluginReturnPromise),
  ]

  @objc func renderMermaidSvg(_ call: CAPPluginCall) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let code = try call.getStringEnsure("code")
        let options = call.getObject("options")
        let svg = try renderMermaidPreviewSvg(
          code: code,
          theme: options?["theme"] as? String,
          fontFamily: options?["fontFamily"] as? String,
          fontSize: (options?["fontSize"] as? NSNumber)?.doubleValue
        )
        call.resolve(["svg": svg])
      } catch {
        call.reject("Failed to render Mermaid preview, \(error)", nil, error)
      }
    }
  }

  @objc func renderTypstSvg(_ call: CAPPluginCall) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let code = try call.getStringEnsure("code")
        let options = call.getObject("options")
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.path
        let fontDirs = try resolveTypstFontDirs(from: options)
        let svg = try renderTypstPreviewSvg(code: code, fontDirs: fontDirs, cacheDir: cacheDir)
        call.resolve(["svg": svg])
      } catch {
        call.reject("Failed to render Typst preview, \(error)", nil, error)
      }
    }
  }
}

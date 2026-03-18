import Foundation
import Capacitor

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
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.path
        let svg = try renderTypstPreviewSvg(code: code, fontDirs: nil, cacheDir: cacheDir)
        call.resolve(["svg": svg])
      } catch {
        call.reject("Failed to render Typst preview, \(error)", nil, error)
      }
    }
  }
}

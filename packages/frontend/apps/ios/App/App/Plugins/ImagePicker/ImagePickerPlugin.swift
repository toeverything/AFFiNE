import AffineResources
import Capacitor
import Foundation
import PhotosUI
import UIKit
import UniformTypeIdentifiers

private struct PickedImageFile {
  let path: String
  let name: String
  let mimeType: String
  let lastModified: Int64

  var dictionary: [String: Any] {
    [
      "path": path,
      "name": name,
      "mimeType": mimeType,
      "lastModified": lastModified,
    ]
  }
}

@objc(ImagePickerPlugin)
public class ImagePickerPlugin: CAPPlugin, CAPBridgedPlugin {
  init(
    associatedController: UIViewController?
  ) {
    controller = associatedController
    super.init()
  }

  weak var controller: UIViewController?

  public let identifier = "ImagePickerPlugin"
  public let jsName = "ImagePicker"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "pickImages", returnType: CAPPluginReturnPromise),
  ]

  private var pendingCall: CAPPluginCall?
  private var allowsMultipleSelection = true

  @objc func pickImages(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard self.pendingCall == nil else {
        call.reject("Another image picker request is already in progress.")
        return
      }

      do {
        try self.clearStagingDirectory()
        let presenter = try self.resolvePresenter()
        self.pendingCall = call
        self.allowsMultipleSelection = call.getBool("multiple") ?? true
        self.presentSourceActionSheet(from: presenter)
      } catch {
        call.reject("Failed to present image picker.", nil, error)
      }
    }
  }

  private func resolvePresenter() throws -> UIViewController {
    if let controller {
      return controller
    }
    if let bridge, let viewController = bridge.viewController {
      return viewController
    }
    throw NSError(
      domain: "ImagePickerPlugin",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "No view controller available."]
    )
  }

  private func presentSourceActionSheet(from presenter: UIViewController) {
    let presentSheet = { [weak self, weak presenter] (theme: ImagePickerSheetTheme) in
      guard let self, let presenter else { return }

      let sheetController = ImagePickerSourceSheetViewController(
        actions: [
          ImagePickerSheetAction(
            title: "Photo Library",
            iconSystemName: "photo.on.rectangle.angled"
          ) { [weak self, weak presenter] in
            guard let self, let presenter else { return }
            self.presentPhotoLibrary(from: presenter)
          },
          ImagePickerSheetAction(
            title: "Take Photo",
            iconSystemName: "camera",
            isEnabled: UIImagePickerController.isSourceTypeAvailable(.camera)
          ) { [weak self, weak presenter] in
            guard let self, let presenter else { return }
            self.presentCamera(from: presenter)
          },
          ImagePickerSheetAction(
            title: "Choose Files",
            iconSystemName: "folder"
          ) { [weak self, weak presenter] in
            guard let self, let presenter else { return }
            self.presentDocumentPicker(from: presenter)
          },
        ],
        theme: theme,
        onCancel: { [weak self] in
          self?.resolvePendingCall(files: [], canceled: true)
        }
      )

      sheetController.overrideUserInterfaceStyle = theme.userInterfaceStyle
      sheetController.modalPresentationStyle = .overFullScreen
      sheetController.modalTransitionStyle = .crossDissolve
      presenter.present(sheetController, animated: false)
    }

    if let webView = bridge?.webView {
      webView.evaluateScript(.getCurrentThemeMode) { output in
        DispatchQueue.main.async {
          presentSheet(Self.sheetTheme(for: output as? String))
        }
      }
      return
    }

    presentSheet(.light)
  }

  private static func sheetTheme(for themeMode: String?) -> ImagePickerSheetTheme {
    switch themeMode {
    case "dark":
      return .dark
    case "system":
      return UITraitCollection.current.userInterfaceStyle == .dark ? .dark : .light
    default:
      return .light
    }
  }

  private func presentPhotoLibrary(from presenter: UIViewController) {
    var configuration = PHPickerConfiguration(photoLibrary: .shared())
    configuration.filter = .images
    configuration.selectionLimit = allowsMultipleSelection ? 0 : 1

    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  private func presentCamera(from presenter: UIViewController) {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.mediaTypes = [UTType.image.identifier]
    picker.allowsEditing = false
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  private func presentDocumentPicker(from presenter: UIViewController) {
    let picker = UIDocumentPickerViewController(
      forOpeningContentTypes: [.image],
      asCopy: true
    )
    picker.delegate = self
    picker.allowsMultipleSelection = allowsMultipleSelection
    presenter.present(picker, animated: true)
  }

  private func resolvePendingCall(files: [PickedImageFile], canceled: Bool) {
    pendingCall?.resolve([
      "files": files.map(\.dictionary),
      "canceled": canceled,
    ])
    pendingCall = nil
  }

  private func rejectPendingCall(message: String, error: Error? = nil) {
    pendingCall?.reject(message, nil, error)
    pendingCall = nil
  }

  private func createStagingDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("affine-image-picker", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  private func clearStagingDirectory() throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("affine-image-picker", isDirectory: true)
    guard FileManager.default.fileExists(atPath: directory.path) else { return }
    try FileManager.default.removeItem(at: directory)
  }

  private func uniqueFileURL(in directory: URL, fileName: String) -> URL {
    let strippedName = (fileName as NSString).lastPathComponent
    let sanitizedName = strippedName
      .components(separatedBy: CharacterSet(charactersIn: "/\\:"))
      .filter { !$0.isEmpty && $0 != "." && $0 != ".." }
      .joined(separator: "-")
    let safeName = sanitizedName.isEmpty ? UUID().uuidString : sanitizedName
    return directory.appendingPathComponent("\(UUID().uuidString)-\(safeName)")
  }

  private func pickedFile(from sourceURL: URL, suggestedName: String? = nil) throws -> PickedImageFile {
    let stagingDirectory = try createStagingDirectory()
    let fileName = suggestedName ?? sourceURL.lastPathComponent
    let destinationURL = uniqueFileURL(in: stagingDirectory, fileName: fileName)

    if FileManager.default.fileExists(atPath: destinationURL.path) {
      try FileManager.default.removeItem(at: destinationURL)
    }

    try FileManager.default.copyItem(at: sourceURL, to: destinationURL)

    let resourceValues = try destinationURL.resourceValues(forKeys: [.contentModificationDateKey])
    let mimeType = UTType(filenameExtension: destinationURL.pathExtension)?.preferredMIMEType ?? "image/*"
    let lastModified = Int64((resourceValues.contentModificationDate ?? Date()).timeIntervalSince1970 * 1000)

    return PickedImageFile(
      path: destinationURL.path,
      name: destinationURL.lastPathComponent,
      mimeType: mimeType,
      lastModified: lastModified
    )
  }

  private func pickedFile(from image: UIImage) throws -> PickedImageFile {
    let stagingDirectory = try createStagingDirectory()
    let destinationURL = uniqueFileURL(in: stagingDirectory, fileName: "captured-image.jpg")

    guard let data = image.jpegData(compressionQuality: 0.92) else {
      throw NSError(
        domain: "ImagePickerPlugin",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Failed to encode captured image."]
      )
    }

    try data.write(to: destinationURL, options: .atomic)

    return PickedImageFile(
      path: destinationURL.path,
      name: destinationURL.lastPathComponent,
      mimeType: "image/jpeg",
      lastModified: Int64(Date().timeIntervalSince1970 * 1000)
    )
  }
}

private struct ImagePickerSheetAction {
  let title: String
  let iconSystemName: String
  var isEnabled: Bool = true
  let handler: () -> Void
}

private enum ImagePickerSheetTheme {
  case dark
  case light

  var userInterfaceStyle: UIUserInterfaceStyle {
    switch self {
    case .dark:
      return .dark
    case .light:
      return .light
    }
  }

  private var traitCollection: UITraitCollection {
    UITraitCollection(userInterfaceStyle: userInterfaceStyle)
  }

  private func resolvedColor(_ color: AffineColors) -> UIColor {
    color.uiColor.resolvedColor(with: traitCollection)
  }

  var dimmingColor: UIColor {
    UIColor.black.withAlphaComponent(self == .dark ? 0.44 : 0.18)
  }

  var backgroundColor: UIColor {
    resolvedColor(.layerBackgroundPrimary)
  }

  var secondaryBackgroundColor: UIColor {
    resolvedColor(.layerBackgroundSecondary)
  }

  var pressedBackgroundColor: UIColor {
    resolvedColor(.layerBackgroundSecondary)
  }

  var borderColor: UIColor {
    resolvedColor(.layerBorder)
  }

  var textColor: UIColor {
    resolvedColor(.textPrimary)
  }

  var iconColor: UIColor {
    resolvedColor(.buttonPrimary)
  }

  var disabledTextColor: UIColor {
    resolvedColor(.textTertiary)
  }
}

private final class ImagePickerSourceSheetViewController: UIViewController {
  private let actions: [ImagePickerSheetAction]
  private let theme: ImagePickerSheetTheme
  private let onCancel: () -> Void
  private let dimmingView = UIView()
  private let contentStackView = UIStackView()
  private let actionsContainerView = UIView()
  private let actionsStackView = UIStackView()
  private let cancelButton = UIButton(type: .system)
  private let handleView = UIView()
  private var separatorViews: [UIView] = []
  private var hasResolvedCancellation = false
  private var isDismissingSheet = false

  init(actions: [ImagePickerSheetAction], theme: ImagePickerSheetTheme, onCancel: @escaping () -> Void) {
    self.actions = actions
    self.theme = theme
    self.onCancel = onCancel
    super.init(nibName: nil, bundle: nil)
    modalPresentationCapturesStatusBarAppearance = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    setupViews()
    setupConstraints()
    updateAppearance()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    animateIn()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) else {
      return
    }
    updateAppearance()
  }

  private func setupViews() {
    view.backgroundColor = .clear

    dimmingView.alpha = 0
    dimmingView.addGestureRecognizer(UITapGestureRecognizer(
      target: self,
      action: #selector(handleCancelTapped)
    ))
    view.addSubview(dimmingView)

    contentStackView.axis = .vertical
    contentStackView.spacing = 12
    contentStackView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(contentStackView)

    handleView.translatesAutoresizingMaskIntoConstraints = false
    handleView.layer.cornerRadius = 2.5
    actionsContainerView.addSubview(handleView)

    actionsContainerView.layer.cornerRadius = 20
    actionsContainerView.clipsToBounds = true
    actionsContainerView.layer.borderWidth = 1 / UIScreen.main.scale

    actionsStackView.axis = .vertical
    actionsStackView.translatesAutoresizingMaskIntoConstraints = false
    actionsContainerView.addSubview(actionsStackView)

    for (index, action) in actions.enumerated() {
      let button = ImagePickerActionButton(action: action, theme: theme)
      button.addTarget(self, action: #selector(handleActionTap(_:)), for: .touchUpInside)
      button.tag = index
      actionsStackView.addArrangedSubview(button)

      if index < actions.count - 1 {
        let separator = UIView()
        separator.translatesAutoresizingMaskIntoConstraints = false
        separatorViews.append(separator)
        actionsStackView.addArrangedSubview(separator)
        separator.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale).isActive = true
      }
    }

    cancelButton.configuration = .plain()
    cancelButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.layer.cornerRadius = 16
    cancelButton.layer.borderWidth = 1 / UIScreen.main.scale
    cancelButton.addTarget(self, action: #selector(handleCancelTapped), for: .touchUpInside)
    cancelButton.heightAnchor.constraint(equalToConstant: 56).isActive = true

    contentStackView.addArrangedSubview(actionsContainerView)
    contentStackView.addArrangedSubview(cancelButton)
  }

  private func setupConstraints() {
    dimmingView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      dimmingView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      dimmingView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      dimmingView.topAnchor.constraint(equalTo: view.topAnchor),
      dimmingView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      contentStackView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      contentStackView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      contentStackView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),

      handleView.topAnchor.constraint(equalTo: actionsContainerView.topAnchor, constant: 8),
      handleView.centerXAnchor.constraint(equalTo: actionsContainerView.centerXAnchor),
      handleView.widthAnchor.constraint(equalToConstant: 36),
      handleView.heightAnchor.constraint(equalToConstant: 5),

      actionsStackView.leadingAnchor.constraint(equalTo: actionsContainerView.leadingAnchor),
      actionsStackView.trailingAnchor.constraint(equalTo: actionsContainerView.trailingAnchor),
      actionsStackView.topAnchor.constraint(equalTo: handleView.bottomAnchor, constant: 12),
      actionsStackView.bottomAnchor.constraint(equalTo: actionsContainerView.bottomAnchor, constant: -8),
    ])
  }

  private func updateAppearance() {
    dimmingView.backgroundColor = theme.dimmingColor
    actionsContainerView.backgroundColor = theme.backgroundColor
    actionsContainerView.layer.borderColor = theme.borderColor.cgColor
    handleView.backgroundColor = theme.borderColor

    separatorViews.forEach { $0.backgroundColor = theme.borderColor }

    cancelButton.backgroundColor = theme.backgroundColor
    cancelButton.layer.borderColor = theme.borderColor.cgColor
    cancelButton.setTitleColor(theme.textColor, for: .normal)
  }

  private func animateIn() {
    contentStackView.transform = CGAffineTransform(translationX: 0, y: 24)
    contentStackView.alpha = 0

    UIView.animate(withDuration: 0.24, delay: 0, options: [.curveEaseOut]) {
      self.dimmingView.alpha = 1
      self.contentStackView.alpha = 1
      self.contentStackView.transform = .identity
    }
  }

  private func dismissSheet(resolveCancellation: Bool = false, completion: (() -> Void)? = nil) {
    guard !isDismissingSheet else { return }
    isDismissingSheet = true

    UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseIn]) {
      self.dimmingView.alpha = 0
      self.contentStackView.alpha = 0
      self.contentStackView.transform = CGAffineTransform(translationX: 0, y: 24)
    } completion: { _ in
      self.dismiss(animated: false) {
        if resolveCancellation, !self.hasResolvedCancellation {
          self.hasResolvedCancellation = true
          self.onCancel()
        }
        completion?()
      }
    }
  }

  @objc private func handleCancelTapped() {
    dismissSheet(resolveCancellation: true)
  }

  @objc private func handleActionTap(_ sender: UIButton) {
    let action = actions[sender.tag]
    guard action.isEnabled else { return }

    dismissSheet {
      action.handler()
    }
  }
}

private final class ImagePickerActionButton: UIButton {
  private let iconContainerView = UIView()
  private let iconView = UIImageView()
  private let titleLabelView = UILabel()
  private let isActionEnabled: Bool
  private let theme: ImagePickerSheetTheme

  init(action: ImagePickerSheetAction, theme: ImagePickerSheetTheme) {
    isActionEnabled = action.isEnabled
    self.theme = theme
    super.init(frame: .zero)

    translatesAutoresizingMaskIntoConstraints = false
    heightAnchor.constraint(equalToConstant: 56).isActive = true
    contentHorizontalAlignment = .fill
    contentVerticalAlignment = .fill

    iconContainerView.translatesAutoresizingMaskIntoConstraints = false
    iconContainerView.layer.cornerRadius = 16
    addSubview(iconContainerView)

    iconView.translatesAutoresizingMaskIntoConstraints = false
    iconView.contentMode = .scaleAspectFit
    iconView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
    iconView.image = UIImage(systemName: action.iconSystemName)
    iconContainerView.addSubview(iconView)

    titleLabelView.translatesAutoresizingMaskIntoConstraints = false
    titleLabelView.font = .systemFont(ofSize: 17, weight: .medium)
    titleLabelView.text = action.title
    addSubview(titleLabelView)

    NSLayoutConstraint.activate([
      iconContainerView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
      iconContainerView.centerYAnchor.constraint(equalTo: centerYAnchor),
      iconContainerView.widthAnchor.constraint(equalToConstant: 32),
      iconContainerView.heightAnchor.constraint(equalToConstant: 32),

      iconView.centerXAnchor.constraint(equalTo: iconContainerView.centerXAnchor),
      iconView.centerYAnchor.constraint(equalTo: iconContainerView.centerYAnchor),

      titleLabelView.leadingAnchor.constraint(equalTo: iconContainerView.trailingAnchor, constant: 12),
      titleLabelView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
      titleLabelView.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])

    isEnabled = action.isEnabled
    updateAppearance()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var isHighlighted: Bool {
    didSet {
      guard isEnabled else { return }
      backgroundColor = isHighlighted ? theme.pressedBackgroundColor : .clear
    }
  }

  private func updateAppearance() {
    backgroundColor = .clear
    iconContainerView.backgroundColor = theme.secondaryBackgroundColor

    if isActionEnabled {
      iconView.tintColor = theme.iconColor
      titleLabelView.textColor = theme.textColor
    } else {
      iconView.tintColor = theme.disabledTextColor
      titleLabelView.textColor = theme.disabledTextColor
    }
  }
}

extension ImagePickerPlugin: PHPickerViewControllerDelegate {
  public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)

    guard !results.isEmpty else {
      resolvePendingCall(files: [], canceled: true)
      return
    }

    let group = DispatchGroup()
    let lock = NSLock()
    var pickedFiles = Array<PickedImageFile?>(repeating: nil, count: results.count)
    var pickedError: Error?

    for (index, result) in results.enumerated() {
      let itemProvider = result.itemProvider
      guard itemProvider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
        continue
      }

      group.enter()
      itemProvider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, error in
        defer { group.leave() }
        guard let self else { return }

        if let error {
          lock.lock()
          pickedError = pickedError ?? error
          lock.unlock()
          return
        }

        guard let url else {
          lock.lock()
          pickedError = pickedError ?? NSError(
            domain: "ImagePickerPlugin",
            code: 3,
            userInfo: [NSLocalizedDescriptionKey: "No image URL returned from photo library."]
          )
          lock.unlock()
          return
        }

        do {
          let file = try self.pickedFile(from: url, suggestedName: itemProvider.suggestedName)
          lock.lock()
          pickedFiles[index] = file
          lock.unlock()
        } catch {
          lock.lock()
          pickedError = pickedError ?? error
          lock.unlock()
        }
      }
    }

    group.notify(queue: .main) {
      if let pickedError {
        self.rejectPendingCall(message: "Failed to load selected images.", error: pickedError)
        return
      }

      self.resolvePendingCall(
        files: pickedFiles.compactMap { $0 },
        canceled: false
      )
    }
  }
}

extension ImagePickerPlugin: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
  public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true)
    resolvePendingCall(files: [], canceled: true)
  }

  public func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    picker.dismiss(animated: true)

    do {
      guard let image = info[.originalImage] as? UIImage else {
        throw NSError(
          domain: "ImagePickerPlugin",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "No captured image returned from camera."]
        )
      }
      let file = try pickedFile(from: image)
      resolvePendingCall(files: [file], canceled: false)
    } catch {
      rejectPendingCall(message: "Failed to process captured image.", error: error)
    }
  }
}

extension ImagePickerPlugin: UIDocumentPickerDelegate {
  public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    do {
      let files = try urls.compactMap { url -> PickedImageFile? in
        guard url.startAccessingSecurityScopedResource() else {
          return nil
        }
        defer { url.stopAccessingSecurityScopedResource() }
        return try pickedFile(from: url)
      }
      resolvePendingCall(files: files, canceled: false)
    } catch {
      rejectPendingCall(message: "Failed to import selected files.", error: error)
    }
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    resolvePendingCall(files: [], canceled: true)
  }
}

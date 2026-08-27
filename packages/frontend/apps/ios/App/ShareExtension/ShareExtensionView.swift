import SwiftUI

struct ShareExtensionView: View {
  @ObservedObject var viewModel: ShareViewModel
  var onCancel: () -> Void
  var onSave: () -> Void

  var body: some View {
    NavigationStack {
      Group {
        if viewModel.isLoading {
          ProgressView("Reading shared content…")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          content
        }
      }
      .navigationTitle("AFFiNE")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Not now", action: onCancel)
            .disabled(viewModel.isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          if viewModel.isSaving {
            ProgressView()
          } else {
            Button(viewModel.actionTitle, action: onSave)
              .fontWeight(.semibold)
              .disabled(!viewModel.canSave)
          }
        }
      }
    }
  }

  private var content: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Text("Choose a workspace in AFFiNE. This item will stay saved until then.")
          .font(.footnote)
          .foregroundStyle(.secondary)

        if viewModel.linkPreviewState != .idle {
          linkPreviewCard
        } else {
          attachmentCard
        }

        if let errorMessage = viewModel.errorMessage {
          Text(errorMessage)
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 20)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(Color(uiColor: .systemGroupedBackground))
  }

  private var titleField: some View {
    TextField(
      "Title",
      text: Binding(
        get: { viewModel.displayTitle },
        set: viewModel.updateTitle
      )
    )
    .font(.system(size: 17, weight: .semibold))
  }

  private var linkPreviewCard: some View {
    VStack(alignment: .leading, spacing: 0) {
      switch viewModel.linkPreviewState {
      case .loading:
        previewSkeleton
      case let .loaded(preview):
        previewContent(preview)
      case .failed:
        fallbackLink(showFailure: true)
      case .deferred:
        fallbackLink(showFailure: false)
      case .idle:
        EmptyView()
      }

      if let selectedText = viewModel.selectedText, !selectedText.isEmpty {
        Rectangle()
          .fill(Color(uiColor: .separator))
          .frame(height: 1)
        VStack(alignment: .leading, spacing: 2) {
          Text("Selected text")
            .font(.footnote.weight(.semibold))
          Text(selectedText)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .lineLimit(3)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .accessibilityElement(children: .combine)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(uiColor: .secondarySystemGroupedBackground))
    .clipShape(RoundedRectangle(cornerRadius: 12))
  }

  @ViewBuilder
  private func previewContent(_ preview: ShareLinkPreview) -> some View {
    previewMedia(viewModel.linkPreviewMediaImage)
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          if let favicon = viewModel.linkPreviewFaviconImage {
            Image(uiImage: favicon)
              .resizable()
              .scaledToFit()
              .frame(width: 16, height: 16)
              .accessibilityHidden(true)
          } else {
            Image(systemName: "link")
              .frame(width: 16, height: 16)
              .accessibilityHidden(true)
          }
          Text(preview.siteName ?? previewHost)
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(.bottom, 2)
        titleField
          .lineLimit(2)
        if let description = preview.description,
           !description.isEmpty,
           description != viewModel.displayTitle
        {
          Text(description)
            .font(.system(size: 14))
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        if let metadata = previewMetadata(preview) {
          Text(metadata)
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      if let transcript = preview.transcript?.previewText {
        transcriptPreview(transcript)
      }
    }
    .padding(14)
  }

  private func transcriptPreview(_ text: String) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Rectangle()
        .fill(Color(uiColor: .separator))
        .frame(height: 1)
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          Image(systemName: "waveform")
            .frame(width: 16, height: 16)
            .accessibilityHidden(true)
          Text("Transcript")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        Text(text)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(viewModel.selectedText?.isEmpty == false ? 2 : 3)
      }
      .padding(.top, 10)
    }
    .padding(.top, 8)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Transcript preview: \(text)")
  }

  private func fallbackLink(showFailure: Bool) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "link")
        .font(.title2)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        titleField
        Text(previewHost)
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
        if showFailure {
          Text("Preview unavailable")
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding(14)
  }

  private var previewSkeleton: some View {
    VStack(alignment: .leading, spacing: 0) {
      Rectangle()
        .fill(.quaternary)
        .frame(maxWidth: .infinity)
        .frame(height: 180)
      GeometryReader { geometry in
        VStack(alignment: .leading, spacing: 8) {
          RoundedRectangle(cornerRadius: 6)
            .fill(.quaternary)
            .frame(width: geometry.size.width * 0.6, height: 12)
          RoundedRectangle(cornerRadius: 6)
            .fill(.quaternary)
            .frame(width: geometry.size.width * 0.9, height: 16)
          RoundedRectangle(cornerRadius: 6)
            .fill(.quaternary)
            .frame(width: geometry.size.width * 0.55, height: 12)
        }
      }
      .frame(height: 56)
      .padding(14)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Loading link preview")
  }

  @ViewBuilder
  private func previewMedia(_ image: UIImage?) -> some View {
    if let image {
      Image(uiImage: image)
        .resizable()
        .scaledToFill()
        .frame(maxWidth: .infinity)
        .frame(height: 180)
        .clipped()
        .accessibilityHidden(true)
    } else {
      mediaPlaceholder
        .frame(maxWidth: .infinity)
        .frame(height: 180)
        .accessibilityHidden(true)
    }
  }

  private var mediaPlaceholder: some View {
    ZStack {
      Color(uiColor: .systemGroupedBackground)
      Image(systemName: "link")
        .font(.system(size: 24))
        .foregroundStyle(.tertiary)
    }
  }

  private var attachmentCard: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let image = viewModel.previewImage {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .frame(maxWidth: .infinity)
          .aspectRatio(16 / 9, contentMode: .fit)
          .frame(maxHeight: 180)
          .clipped()
          .accessibilityHidden(true)
      }
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: viewModel.previewImage == nil ? "doc.text" : "photo")
          .font(.title2)
          .frame(width: 32, height: 32)
          .foregroundStyle(.secondary)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 4) {
          titleField
          if !viewModel.previewText.isEmpty {
            Text(viewModel.previewText)
              .lineLimit(3)
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
        }
      }
      .padding(14)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(uiColor: .secondarySystemGroupedBackground))
    .clipShape(RoundedRectangle(cornerRadius: 12))
  }

  private var previewHost: String {
    guard let value = viewModel.sharedURL, let url = URL(string: value) else { return "Link" }
    return url.host ?? value
  }

  private func previewMetadata(_ preview: ShareLinkPreview) -> String? {
    var values: [String] = []
    if let author = preview.author?.name { values.append(author) }
    if let duration = preview.durationSeconds {
      values.append(String(format: "%d:%02d", Int(duration) / 60, Int(duration) % 60))
    }
    return values.prefix(2).isEmpty ? nil : values.prefix(2).joined(separator: " · ")
  }
}

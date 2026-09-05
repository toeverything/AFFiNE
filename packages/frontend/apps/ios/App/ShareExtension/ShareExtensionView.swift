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

        sourceCard

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

  private var sourceCard: some View {
    Group {
      switch viewModel.linkPreviewState {
      case .loading:
        richPreviewSkeleton
      case .loaded(let preview):
        richPreviewCard(preview)
      case .idle, .failed:
        compactSourceCard
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(uiColor: .secondarySystemGroupedBackground))
    .clipShape(.rect(cornerRadius: 12))
  }

  private var compactSourceCard: some View {
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
          TextField(
            "Title",
            text: Binding(
              get: { viewModel.displayTitle },
              set: viewModel.updateTitle
            )
          )
          .font(.headline)

          if let host = sharedURLHost {
            Text(host)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }

          if let selectedText = viewModel.selectedText, !selectedText.isEmpty {
            Text(selectedText)
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .lineLimit(3)
          } else if !viewModel.previewText.isEmpty {
            Text(viewModel.previewText)
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .lineLimit(3)
          }
        }
      }
      .padding(14)
    }
  }

  private var richPreviewSkeleton: some View {
    VStack(alignment: .leading, spacing: 0) {
      Color(uiColor: .tertiarySystemFill)
        .aspectRatio(16 / 9, contentMode: .fit)

      VStack(alignment: .leading, spacing: 12) {
        skeletonLine(width: 92, height: 16)
        skeletonLine(height: 22)
        skeletonLine(width: 240, height: 16)
        skeletonLine(width: 180, height: 14)
        Divider()
        skeletonLine(width: 110, height: 16)
        skeletonLine(height: 14)
        skeletonLine(width: 260, height: 14)
      }
      .padding(14)
      .redacted(reason: .placeholder)
    }
    .accessibilityLabel("Loading link preview")
  }

  private func skeletonLine(width: CGFloat? = nil, height: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: 4)
      .fill(Color(uiColor: .tertiarySystemFill))
      .frame(maxWidth: width == nil ? .infinity : nil)
      .frame(width: width, height: height)
  }

  private func richPreviewCard(_ preview: ShareLinkPreview) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      richMedia(preview)

      VStack(alignment: .leading, spacing: 10) {
        providerRow(preview)

        TextField(
          "Title",
          text: Binding(
            get: { viewModel.displayTitle },
            set: viewModel.updateTitle
          ),
          axis: .vertical
        )
        .font(.headline)
        .lineLimit(1...2)

        if let description = preview.description, !description.isEmpty {
          Text(description)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(3)
        }

        if let metadata = richMetadata(preview) {
          Text(metadata)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        if let transcript = preview.transcript?.previewText {
          Divider()
          Label("Transcript", systemImage: "waveform")
            .font(.subheadline.weight(.medium))
          Text(transcript)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(4)
        }
      }
      .padding(14)
    }
  }

  @ViewBuilder
  private func richMedia(_ preview: ShareLinkPreview) -> some View {
    if let image = viewModel.remoteMediaImage {
      Image(uiImage: image)
        .resizable()
        .scaledToFill()
        .frame(maxWidth: .infinity)
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipped()
        .accessibilityHidden(true)
    } else {
      ZStack {
        Color(uiColor: .tertiarySystemFill)
        Image(systemName: preview.images?.isEmpty == false ? "photo" : "link")
          .font(.title)
          .foregroundStyle(.secondary)
      }
      .aspectRatio(16 / 9, contentMode: .fit)
      .accessibilityHidden(true)
    }
  }

  private func providerRow(_ preview: ShareLinkPreview) -> some View {
    HStack(spacing: 7) {
      if let favicon = viewModel.remoteFaviconImage {
        Image(uiImage: favicon)
          .resizable()
          .scaledToFit()
          .frame(width: 18, height: 18)
          .clipShape(.rect(cornerRadius: 3))
          .accessibilityHidden(true)
      } else if preview.provider?.lowercased() == "youtube" {
        ZStack {
          RoundedRectangle(cornerRadius: 4)
            .fill(Color.red)
            .frame(width: 22, height: 15)
          Image(systemName: "play.fill")
            .font(.system(size: 7, weight: .bold))
            .foregroundStyle(.white)
        }
        .frame(width: 22, height: 18)
        .accessibilityHidden(true)
      } else {
        Image(systemName: "globe")
          .frame(width: 18, height: 18)
          .foregroundStyle(.secondary)
          .accessibilityHidden(true)
      }

      Text(providerName(preview))
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }

  private func providerName(_ preview: ShareLinkPreview) -> String {
    if let siteName = preview.siteName, !siteName.isEmpty { return siteName }
    if let provider = preview.provider, !provider.isEmpty { return provider.capitalized }
    return sharedURLHost ?? "Website"
  }

  private func richMetadata(_ preview: ShareLinkPreview) -> String? {
    var values: [String] = []
    if let author = preview.author?.name, !author.isEmpty {
      values.append(author)
    }
    if let duration = preview.formattedDuration, !duration.isEmpty {
      values.append(duration)
    }
    return values.isEmpty ? nil : values.joined(separator: " · ")
  }

  private var sharedURLHost: String? {
    guard let value = viewModel.sharedURL, let url = URL(string: value) else { return nil }
    return url.host ?? value
  }
}

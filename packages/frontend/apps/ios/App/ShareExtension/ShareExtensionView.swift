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
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(uiColor: .secondarySystemGroupedBackground))
    .clipShape(.rect(cornerRadius: 12))
  }

  private var sharedURLHost: String? {
    guard let value = viewModel.sharedURL, let url = URL(string: value) else { return nil }
    return url.host ?? value
  }
}

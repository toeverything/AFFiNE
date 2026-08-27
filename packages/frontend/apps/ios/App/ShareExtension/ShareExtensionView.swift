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
    Form {
      Section {
        Text("Choose a workspace in AFFiNE. This item will stay saved until then.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      Section {
        HStack(alignment: .top, spacing: 12) {
          Image(systemName: viewModel.previewImage == nil ? "doc.text" : "photo")
            .font(.title2)
            .frame(width: 32, height: 32)
            .foregroundStyle(.secondary)
          VStack(alignment: .leading, spacing: 4) {
            TextField("Title", text: $viewModel.title)
              .font(.headline)
            if !viewModel.previewText.isEmpty {
              Text(viewModel.previewText)
                .lineLimit(3)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
          }
        }
        if let image = viewModel.previewImage {
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(maxHeight: 180)
        }
      }

      if let errorMessage = viewModel.errorMessage {
        Section {
          Text(errorMessage)
            .foregroundStyle(.red)
        }
      }
    }
  }
}

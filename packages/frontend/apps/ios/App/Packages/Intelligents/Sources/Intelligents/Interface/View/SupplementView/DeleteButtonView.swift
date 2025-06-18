import UIKit

class DeleteButtonView: UIView {
  let imageView = UIImageView(image: .init(systemName: "xmark")).then {
    $0.tintColor = .white
    $0.contentMode = .scaleAspectFit
  }

  let blur = UIVisualEffectView(
    effect: UIBlurEffect(style: .systemUltraThinMaterialDark)
  ).then {
    $0.clipsToBounds = true
  }

  var onTapped: () -> Void = {}

  override init(frame: CGRect) {
    super.init(frame: frame)

    isUserInteractionEnabled = true

    addSubview(blur)
    addSubview(imageView)

    blur.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }
    imageView.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(2)
    }

    let gesture = UITapGestureRecognizer(target: self, action: #selector(tapped))
    addGestureRecognizer(gesture)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    if bounds.width < 50 || bounds.height < 50 {
      return bounds.insetBy(dx: -20, dy: -20).contains(point)
    }
    return super.point(inside: point, with: event)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    blur.layer.cornerRadius = min(bounds.width, bounds.height) / 2
  }

  @objc func tapped() {
    onTapped()
  }
}

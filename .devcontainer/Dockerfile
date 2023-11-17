FROM mcr.microsoft.com/devcontainers/base:bookworm

# Install Homebrew For Linux
RUN /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && \
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)" && \
    echo "eval \"\$($(brew --prefix)/bin/brew shellenv)\"" >> /home/vscode/.zshrc && \
    echo "eval \"\$($(brew --prefix)/bin/brew shellenv)\"" >> /home/vscode/.bashrc && \
    # Install Graphite
    brew install withgraphite/tap/graphite && gt --version
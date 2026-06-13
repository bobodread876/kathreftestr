#!/bin/bash

# Kathreftestr One-Click Installer
# Supports: Linux, macOS, Docker, Docker Compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/islandbitcoin/kathreftestr.git"
INSTALL_DIR="$HOME/kathreftestr"
COMPOSE_VERSION="2.20.0"

# Print colored output
print_color() {
    printf "${2}${1}${NC}\n"
}

# Print header
print_header() {
    echo ""
    print_color "╔═══════════════════════════════════════════╗" "$BLUE"
    print_color "║     Kathreftestr One-Click Installer     ║" "$BLUE"
    print_color "║   Stream YouTube/Twitch to Nostr with    ║" "$BLUE"
    print_color "║         Bitcoin Lightning Tips           ║" "$BLUE"
    print_color "╚═══════════════════════════════════════════╝" "$BLUE"
    echo ""
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_color "⚠️  Warning: Running as root. This is not recommended." "$YELLOW"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        # Detect Linux distribution
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            DISTRO=$ID
            print_color "✓ Detected: $PRETTY_NAME" "$GREEN"
        else
            DISTRO="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        print_color "✓ Detected: macOS" "$GREEN"
    else
        print_color "✗ Unsupported OS: $OSTYPE" "$RED"
        exit 1
    fi
}

# Install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        print_color "✓ Docker is already installed" "$GREEN"
        return 0
    fi

    print_color "📦 Installing Docker..." "$YELLOW"
    
    if [[ "$OS" == "linux" ]]; then
        # Use Docker's official install script
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
        
        # Add user to docker group
        sudo usermod -aG docker $USER
        
        print_color "✓ Docker installed successfully" "$GREEN"
        print_color "ℹ️  You may need to log out and back in for group changes to take effect" "$YELLOW"
    elif [[ "$OS" == "macos" ]]; then
        print_color "Please install Docker Desktop for Mac from:" "$YELLOW"
        print_color "https://www.docker.com/products/docker-desktop/" "$BLUE"
        print_color "Then run this installer again." "$YELLOW"
        exit 1
    fi
}

# Install Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        print_color "✓ Docker Compose is already installed" "$GREEN"
        return 0
    fi

    print_color "📦 Installing Docker Compose..." "$YELLOW"
    
    if [[ "$OS" == "linux" ]]; then
        # Install Docker Compose v2 as Docker plugin
        sudo mkdir -p /usr/local/lib/docker/cli-plugins
        sudo curl -SL "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
            -o /usr/local/lib/docker/cli-plugins/docker-compose
        sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
        
        print_color "✓ Docker Compose installed successfully" "$GREEN"
    fi
}

# Install Git
install_git() {
    if command -v git &> /dev/null; then
        print_color "✓ Git is already installed" "$GREEN"
        return 0
    fi

    print_color "📦 Installing Git..." "$YELLOW"
    
    if [[ "$OS" == "linux" ]]; then
        case $DISTRO in
            ubuntu|debian)
                sudo apt-get update && sudo apt-get install -y git
                ;;
            fedora|centos|rhel)
                sudo yum install -y git
                ;;
            arch|manjaro)
                sudo pacman -S --noconfirm git
                ;;
            *)
                print_color "Please install git manually for your distribution" "$YELLOW"
                exit 1
                ;;
        esac
    elif [[ "$OS" == "macos" ]]; then
        # Git comes with Xcode command line tools on macOS
        xcode-select --install
    fi
}

# Clone or update repository
setup_repository() {
    if [ -d "$INSTALL_DIR" ]; then
        print_color "📂 Found existing installation at $INSTALL_DIR" "$YELLOW"
        read -p "Update existing installation? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd "$INSTALL_DIR"
            git pull origin main
            print_color "✓ Repository updated" "$GREEN"
        fi
    else
        print_color "📥 Cloning Kathreftestr repository..." "$YELLOW"
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        print_color "✓ Repository cloned" "$GREEN"
    fi
}

# Create environment file
create_env_file() {
    if [ -f "$INSTALL_DIR/.env" ]; then
        print_color "✓ Environment file already exists" "$GREEN"
        read -p "Would you like to reconfigure? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi

    print_color "⚙️  Creating configuration..." "$YELLOW"
    
    # Get user input for configuration
    read -p "Enter your domain (or press Enter for localhost): " DOMAIN
    DOMAIN=${DOMAIN:-localhost}
    
    if [[ "$DOMAIN" != "localhost" ]]; then
        PROTOCOL="https"
        WS_PROTOCOL="wss"
    else
        PROTOCOL="http"
        WS_PROTOCOL="ws"
    fi

    cat > "$INSTALL_DIR/.env" << EOF
# Kathreftestr Configuration
# Generated on $(date)

NODE_ENV=production

# Application URLs
APP_URL=${PROTOCOL}://${DOMAIN}:3000
WS_URL=${WS_PROTOCOL}://${DOMAIN}:8082
RTMP_URL=rtmp://${DOMAIN}:1935
HLS_URL=http://${DOMAIN}:8890

# Optional: Redis password (for multi-container setup)
REDIS_PASSWORD=$(openssl rand -base64 32 2>/dev/null || echo "kathreftestr-$(date +%s)")

# Optional: Custom ports (if defaults are in use)
# PORT=3000
# WS_PORT=8082
# RTMP_PORT=1935
# HLS_PORT=8890
EOF

    print_color "✓ Configuration created" "$GREEN"
}

# Build and start services
start_services() {
    print_color "🏗️  Building Kathreftestr..." "$YELLOW"
    
    cd "$INSTALL_DIR"
    
    # Check if unified Dockerfile exists
    if [ -f "Dockerfile.unified" ]; then
        docker compose build
    else
        print_color "⚠️  Dockerfile.unified not found, using default Dockerfile" "$YELLOW"
        docker compose build
    fi
    
    print_color "🚀 Starting Kathreftestr..." "$YELLOW"
    docker compose up -d
    
    print_color "✓ Services started" "$GREEN"
}

# Wait for services to be healthy
wait_for_health() {
    print_color "⏳ Waiting for services to be healthy..." "$YELLOW"
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
            print_color "✓ Services are healthy!" "$GREEN"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    print_color "⚠️  Services are taking longer than expected to start" "$YELLOW"
    print_color "Check logs with: docker compose logs" "$YELLOW"
    return 1
}

# Display success message
show_success() {
    echo ""
    print_color "╔═══════════════════════════════════════════╗" "$GREEN"
    print_color "║      🎉 Installation Successful! 🎉       ║" "$GREEN"
    print_color "╚═══════════════════════════════════════════╝" "$GREEN"
    echo ""
    print_color "Access Kathreftestr at:" "$BLUE"
    print_color "  🌐 Web UI:    http://localhost:3000" "$GREEN"
    print_color "  📺 RTMP:      rtmp://localhost:1935/live" "$GREEN"
    print_color "  📡 HLS:       http://localhost:8890" "$GREEN"
    print_color "  🔌 WebSocket: ws://localhost:8082" "$GREEN"
    echo ""
    print_color "Useful commands:" "$YELLOW"
    print_color "  View logs:    docker compose logs -f" "$BLUE"
    print_color "  Stop:         docker compose down" "$BLUE"
    print_color "  Restart:      docker compose restart" "$BLUE"
    print_color "  Update:       git pull && docker compose up -d --build" "$BLUE"
    echo ""
    print_color "📚 Documentation: https://github.com/islandbitcoin/kathreftestr" "$BLUE"
    print_color "💬 Support:       https://github.com/islandbitcoin/kathreftestr/issues" "$BLUE"
    echo ""
}

# Cleanup function
cleanup() {
    print_color "\n⚠️  Installation interrupted" "$YELLOW"
    exit 1
}

# Trap Ctrl+C
trap cleanup INT

# Main installation flow
main() {
    print_header
    check_root
    detect_os
    
    print_color "📋 Starting installation process..." "$BLUE"
    echo ""
    
    # Install dependencies
    install_git
    install_docker
    install_docker_compose
    
    # Setup application
    setup_repository
    create_env_file
    start_services
    
    # Verify installation
    if wait_for_health; then
        show_success
    else
        print_color "⚠️  Installation completed but health check failed" "$YELLOW"
        print_color "Please check the logs for more information" "$YELLOW"
        exit 1
    fi
}

# Run main function
main "$@"
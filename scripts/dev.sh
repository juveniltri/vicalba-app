#!/usr/bin/env bash
# Entorno de desarrollo local para vicalba-app.
# Uso: ./scripts/dev.sh [start|stop|reset|status]
set -euo pipefail

# ─── Colores ─────────────────────────────────────────────────────────────────
BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()   { echo -e "${BLUE}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
die()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

CMD="${1:-start}"
case "$CMD" in start|stop|reset|status) ;; *)
  echo "Uso: $0 [start|stop|reset|status]"
  echo ""
  echo "  start   Levanta la BD, migra, siembra y arranca el servidor"
  echo "  stop    Para PostgreSQL"
  echo "  reset   Borra y recrea la BD (útil para probar desde cero)"
  echo "  status  Muestra el estado de los servicios"
  exit 0 ;;
esac

# ─── Prerequisitos ────────────────────────────────────────────────────────────
check_prereqs() {
  command -v docker &>/dev/null || die "Docker no encontrado. Instala Docker Desktop."
  docker info &>/dev/null 2>&1    || die "Docker no está corriendo. Abre Docker Desktop."
  command -v node &>/dev/null     || die "Node.js no encontrado."
  ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) · Node $(node -v) · npm $(npm -v)"
}

# ─── Docker socket ────────────────────────────────────────────────────────────
detect_socket() {
  local candidates=(
    "/var/run/docker.sock"
    "$HOME/.docker/run/docker.sock"
    "/run/user/$(id -u 2>/dev/null || echo 0)/docker.sock"
  )
  for p in "${candidates[@]}"; do
    [ -S "$p" ] && echo "$p" && return
  done
  echo "/var/run/docker.sock"
}

# ─── .env.local ───────────────────────────────────────────────────────────────
setup_env() {
  if [ ! -f "$ENV_FILE" ]; then
    log "Creando .env.local con secretos generados..."
    cat > "$ENV_FILE" <<EOF
NODE_ENV=development
REPOS_DIR=/tmp/vicalba/repos
TRAEFIK_DYNAMIC_DIR=/tmp/vicalba/traefik/dynamic
ACME_JSON_PATH=/tmp/vicalba/traefik/acme.json
DATABASE_URL=postgresql://vicalba:dev-password@localhost:5432/vicalba
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
DOCKER_SOCKET_PATH=$(detect_socket)
TRAEFIK_CONTAINER_NAME=traefik
LOG_LEVEL=debug
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
    ok ".env.local creado"
  fi

  # Corregir DOCKER_SOCKET_PATH si el socket real está en otro sitio (macOS)
  local socket
  socket="$(detect_socket)"
  if ! grep -q "DOCKER_SOCKET_PATH=$socket" "$ENV_FILE" 2>/dev/null; then
    # sed -i con extensión vacía funciona en macOS y Linux
    sed -i.bak "s|DOCKER_SOCKET_PATH=.*|DOCKER_SOCKET_PATH=$socket|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    ok "Docker socket actualizado → $socket"
  fi
}

# ─── Directorios locales ──────────────────────────────────────────────────────
setup_dirs() {
  mkdir -p /tmp/vicalba/repos /tmp/vicalba/traefik/dynamic
  # acme.json vacío para que leerEstadoSSL no falle al leer el archivo
  touch /tmp/vicalba/traefik/acme.json
  ok "Directorios en /tmp/vicalba/ listos"
}

# ─── PostgreSQL ───────────────────────────────────────────────────────────────
db_up() {
  log "Arrancando PostgreSQL..."
  docker compose -f "$ROOT/docker-compose.dev.yml" up -d --wait
  ok "PostgreSQL listo en localhost:5432"
}

db_down() {
  log "Parando PostgreSQL..."
  docker compose -f "$ROOT/docker-compose.dev.yml" down
  ok "PostgreSQL parado"
}

# ─── BD ───────────────────────────────────────────────────────────────────────
migrate() {
  log "Ejecutando migraciones Prisma..."
  (cd "$ROOT" && npm run db:migrate --silent)
  ok "Migraciones aplicadas"
}

seed() {
  log "Poblando BD..."
  (cd "$ROOT" && npm run db:seed --silent)
  ok "Datos de desarrollo cargados"
}

# ─── Status ───────────────────────────────────────────────────────────────────
show_status() {
  echo ""
  echo "── PostgreSQL ──────────────────────────────────────────"
  docker compose -f "$ROOT/docker-compose.dev.yml" ps 2>/dev/null || warn "No se pudo consultar el estado"
  echo ""
  echo "── Servidor de desarrollo ──────────────────────────────"
  if lsof -i :3000 -sTCP:LISTEN &>/dev/null 2>&1; then
    ok "App corriendo → http://localhost:3000"
  else
    warn "App no está corriendo  (ejecuta: ./scripts/dev.sh start)"
  fi
  echo ""
}

# ─── Comandos ─────────────────────────────────────────────────────────────────
case "$CMD" in

  start)
    check_prereqs
    setup_env
    setup_dirs
    db_up
    migrate
    seed
    echo ""
    echo -e "  ${GREEN}Panel listo en http://localhost:3000${NC}"
    echo "  Usuario:  admin@vicalba.local"
    echo "  Password: dev-password-2026"
    echo ""
    echo "  Ctrl+C → para el servidor  |  ./scripts/dev.sh stop → para la BD"
    echo ""
    cd "$ROOT" && npm run dev
    ;;

  stop)
    db_down
    ;;

  reset)
    check_prereqs
    setup_env
    setup_dirs
    db_up
    log "Reseteando BD (borra todo y recrea)..."
    (cd "$ROOT" && npm run db:reset)
    echo ""
    ok "BD reseteada — usuario: admin@vicalba.local / dev-password-2026"
    ;;

  status)
    show_status
    ;;

esac

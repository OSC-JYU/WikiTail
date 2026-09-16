# Wikitail — top-level Makefile.
#
# Wraps the commands you actually run day-to-day: local development, tests,
# the container image, and running/inspecting the container. `make help` lists
# everything.

IMAGE     ?= localhost/wikitail
TAG       ?= latest
IMAGE_REF := $(IMAGE):$(TAG)

CONTAINER ?= wikitail
PORT      ?= 3000
HOST_PORT ?= 3000
BIND      ?= 127.0.0.1

# Podman by default; override with `make ENGINE=docker <target>` to use docker.
ENGINE ?= $(shell command -v podman 2>/dev/null || command -v docker 2>/dev/null)

# Volumes for the local `make run`. Named so `podman volume ls` shows them
# clearly and re-running does not lose state.
DATA_VOLUME    ?= wikitail-data
UPLOADS_VOLUME ?= wikitail-uploads

.DEFAULT_GOAL := help
.PHONY: help install dev build test lint format check clean \
        admin container-admin \
        image image-nocache run stop restart logs shell smoke \
        volumes volume-clean quadlet-install

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} \
	     /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' \
	     $(MAKEFILE_LIST)

# ---- Local (Node on the host) ----------------------------------------------

install: ## Install npm workspace deps
	npm ci

dev: ## Run server + client dev servers (http://localhost:5173)
	npm run dev

build: ## Build the client (Vite → packages/client/dist)
	npm run build

test: ## Run server tests
	npm test

lint: ## ESLint everything
	npm run lint

format: ## Prettier write
	npm run format

check: lint test ## Lint + test (what CI would run)

clean: ## Remove build output and node_modules
	rm -rf packages/*/dist packages/*/node_modules node_modules

# ---- Admin bootstrap -------------------------------------------------------

admin: ## Create or promote an admin against the *local* DB.  Usage: make admin EMAIL=you@example.org
	@if [ -z "$(EMAIL)" ]; then echo "Usage: make admin EMAIL=you@example.org"; exit 2; fi
	npm run admin -w @wikitail/server -- add "$(EMAIL)"

container-admin: ## Same, but against the running container.       Usage: make container-admin EMAIL=you@example.org
	@if [ -z "$(EMAIL)" ]; then echo "Usage: make container-admin EMAIL=you@example.org"; exit 2; fi
	$(ENGINE) exec $(CONTAINER) npx --no-install tsx packages/server/src/cli/admin.ts add "$(EMAIL)"

# ---- Container image -------------------------------------------------------

image: ## Build the container image
	$(ENGINE) build -t $(IMAGE_REF) .

image-nocache: ## Build the image without the layer cache
	$(ENGINE) build --no-cache -t $(IMAGE_REF) .

# ---- Container lifecycle ---------------------------------------------------

volumes: ## Create the named volumes (idempotent)
	@$(ENGINE) volume inspect $(DATA_VOLUME)    >/dev/null 2>&1 || $(ENGINE) volume create $(DATA_VOLUME)
	@$(ENGINE) volume inspect $(UPLOADS_VOLUME) >/dev/null 2>&1 || $(ENGINE) volume create $(UPLOADS_VOLUME)

run: image volumes ## Build and run the container in the background
	@$(ENGINE) rm -f $(CONTAINER) >/dev/null 2>&1 || true
	$(ENGINE) run -d \
	    --name $(CONTAINER) \
	    -p $(BIND):$(HOST_PORT):$(PORT) \
	    -e AUTH_MODE=dev \
	    -e DEV_USER_EMAIL=dev@wikitail.local \
	    -v $(DATA_VOLUME):/data:Z \
	    -v $(UPLOADS_VOLUME):/uploads:Z \
	    $(IMAGE_REF)
	@echo "Wikitail running on http://$(BIND):$(HOST_PORT) (AUTH_MODE=dev)"

stop: ## Stop and remove the container
	@$(ENGINE) rm -f $(CONTAINER) >/dev/null 2>&1 || true

restart: stop run ## Stop, rebuild image, and start again

logs: ## Follow container logs
	$(ENGINE) logs -f $(CONTAINER)

shell: ## Open a shell in the running container
	$(ENGINE) exec -it $(CONTAINER) sh

smoke: ## Hit the API + SPA to check the container answers
	@printf 'API : ' && curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://$(BIND):$(HOST_PORT)/api/users/me
	@printf 'SPA : ' && curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://$(BIND):$(HOST_PORT)/

volume-clean: ## Delete the local named volumes (destroys data!)
	$(ENGINE) volume rm $(DATA_VOLUME) $(UPLOADS_VOLUME)

# ---- Deployment aid --------------------------------------------------------

quadlet-install: ## Install Quadlet units to /etc/containers/systemd/ (needs sudo)
	sudo install -m 0644 deploy/quadlet/wikitail.container       /etc/containers/systemd/
	sudo install -m 0644 deploy/quadlet/wikitail-data.volume     /etc/containers/systemd/
	sudo install -m 0644 deploy/quadlet/wikitail-uploads.volume  /etc/containers/systemd/
	sudo systemctl daemon-reload
	@echo "Now: sudo systemctl start wikitail.service"

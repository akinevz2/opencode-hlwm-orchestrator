# opencode-hlwm-orchestrator — the per-package depends adapter (the
# uniform layout): the artifact IS the checkout (a plugin + skill —
# nothing to compile); `link` is a no-op because the DOTS stow walk
# owns the deployment (the package ships the checkout symlinks);
# `install` is the EXTERNAL route: clone anywhere, `make install`
# wires it into ~/.config/opencode.

DOTS     ?= $(HOME)/dots
PKG_ROOT ?= $(DOTS)/opencode
SUB_DIR  := $(abspath $(PKG_ROOT)/.local/share/opencode-hlwm-orchestrator)
OC_DIR   := $(abspath $(HOME)/.config/opencode)

FORCE ?=

.DEFAULT_GOAL := status
.PHONY: metadata build link install uninstall status

metadata:
	@echo PACKAGE=opencode-hlwm-orchestrator
	@echo METHOD=source
	@echo SUB_DIR=$(SUB_DIR)
	@echo ARTIFACT=$(OC_DIR)/opencode-hlwm-orchestrator/index.ts
	@echo VERSION=$$(grep -o '"version": "[^"]*"' plugin/package.json | cut -d'"' -f4)

# build rung — nothing to compile (the artifact is the checkout)
build:
	@echo "orchestrator: nothing to build (plugin + skill are the artifact)"

# link rung — the dots stow walk owns the config links (the package
# ships them); standalone check only
link:
	@test -e $(OC_DIR)/skills/orchestrate/SKILL.md || { echo "orchestrator: not linked (dots stow, or run make install)"; exit 1; }
	@echo "orchestrator: linked"

# EXTERNAL install: wire the plugin + skill into the opencode config
# by relative-internal symlink (a clone anywhere works; the links
# survive repo moves)
install:
	mkdir -p $(OC_DIR)/skills
	ln -sfn $(SUB_DIR)/skill/orchestrate $(OC_DIR)/skills/orchestrate
	ln -sfn $(SUB_DIR)/plugin $(OC_DIR)/opencode-hlwm-orchestrator
	@echo "orchestrator: installed — add \"./opencode-hlwm-orchestrator\" to opencode.jsonc \"plugins\" if not stow-deployed"

uninstall:
	rm -f $(OC_DIR)/skills/orchestrate $(OC_DIR)/opencode-hlwm-orchestrator

status:
	@test -d $(SUB_DIR) && echo "checkout: $(SUB_DIR)" || echo "checkout: MISSING"
	@test -e $(OC_DIR)/skills/orchestrate/SKILL.md && echo "skill: linked" || echo "skill: NOT linked"
	@test -e $(OC_DIR)/opencode-hlwm-orchestrator/index.ts && echo "plugin: linked" || echo "plugin: NOT linked"
	@pgrep -f orchestrate-watch.sh >/dev/null && echo "watch daemon: running" || echo "watch daemon: not running"

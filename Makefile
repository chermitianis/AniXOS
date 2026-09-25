# ============================================================================
# AniXOS — Makefile
# ============================================================================
# Raccourcis pour les commandes les plus utilisées.
# Usage : make <target>
# ============================================================================

.PHONY: help setup install build build-web build-android build-desktop deploy fresh update clean dry-run prereqs test

# --- Aide par défaut ---
help:
	@echo ""
	@echo "  AniXOS — Commandes disponibles :"
	@echo ""
	@echo "  make setup           Menu interactif"
	@echo "  make install         Installer les dépendances"
	@echo "  make build           Build tout (web + android + desktop)"
	@echo "  make build-web       Build web uniquement"
	@echo "  make build-android   Build APK Android"
	@echo "  make build-desktop   Build Desktop (EXE/DMG/DEB)"
	@echo "  make deploy          Migrations + Edge Functions"
	@echo "  make fresh           Clean install complet"
	@echo "  make update          Rebuild sans clean"
	@echo "  make clean           Nettoyer les artefacts"
	@echo "  make dry-run         Aperçu du pipeline"
	@echo "  make prereqs         Vérifier les prérequis"
	@echo ""

# --- Commandes principales ---
setup:
	node setup.mjs

install:
	node setup.mjs --update --only=web

build:
	node setup.mjs --all

build-web:
	node setup.mjs --only=web

build-android:
	node setup.mjs --only=android

build-desktop:
	node setup.mjs --only=desktop

deploy:
	node setup.mjs --only=deploy

fresh:
	node setup.mjs --fresh --all

update:
	node setup.mjs --update --all

dry-run:
	node setup.mjs --all --dry-run

prereqs:
	node setup.mjs --only=prereqs

# --- Nettoyage manuel (sans confirmation) ---
clean:
	@echo "Nettoyage manuel..."
	rm -rf node_modules apps/web/node_modules apps/web/dist apps/web/.vite
	rm -rf src-tauri/target android/app/build release
	rm -f .setup-state.json
	@echo "Termine."
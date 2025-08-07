.PHONY: dev

# 通过 ARGS 变量向脚本传递参数
# 示例: make dev ARGS="-d"
ARGS ?=

ifeq ($(OS),Windows_NT)
dev:
	@echo "Starting development environment on Windows..."
	@powershell -ExecutionPolicy Bypass -File ./launch/dev.ps1 $(ARGS)
else
dev:
	@echo "Starting development environment on Unix..."
	@./launch/dev.sh $(ARGS)
endif

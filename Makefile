.PHONY: dev

# 通过 ARGS 变量向脚本传递参数
# 示例: make dev ARGS="-d"
ARGS ?=

# 根据操作系统选择执行不同的脚本
# Windows 系统会执行 dev.ps1
ifeq ($(OS),Windows_NT)
dev:
	@echo "Starting development environment on Windows..."
	@powershell -File ./launch/dev.ps1 $(ARGS)
# 非 Windows 系统（如 macOS, Linux）会执行 dev.sh
else
dev:
	@echo "Starting development environment..."
	@./launch/dev.sh $(ARGS)
endif

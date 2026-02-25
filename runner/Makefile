BINARY_NAME = xyzen
VERSION ?= 0.1.0
LDFLAGS = -ldflags "-s -w -X github.com/scienceol/xyzen/runner/cmd.version=$(VERSION)"

.PHONY: build clean test all

build:
	go build $(LDFLAGS) -o bin/$(BINARY_NAME) .

test:
	go test ./...

clean:
	rm -rf bin/

# Cross-compile for all platforms
all: clean
	GOOS=darwin  GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY_NAME)-darwin-amd64 .
	GOOS=darwin  GOARCH=arm64 go build $(LDFLAGS) -o bin/$(BINARY_NAME)-darwin-arm64 .
	GOOS=linux   GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY_NAME)-linux-amd64 .
	GOOS=linux   GOARCH=arm64 go build $(LDFLAGS) -o bin/$(BINARY_NAME)-linux-arm64 .
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY_NAME)-windows-amd64.exe .

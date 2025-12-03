# Build Stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=1 GOOS=linux go build -o server ./cmd/api

# Run Stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies (sqlite)
RUN apk add --no-cache sqlite-libs

# Copy binary and config
COPY --from=builder /app/server .
COPY --from=builder /app/.env .
# Note: tom.db will be created if not exists, or mounted via volume

EXPOSE 8080

CMD ["./server"]

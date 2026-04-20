FROM alpine:3.20 AS build
RUN apk add --no-cache zig
WORKDIR /app
COPY build.zig build.zig.zon ./
COPY src ./src
RUN zig build -Doptimize=ReleaseSafe

FROM alpine:3.20
COPY --from=build /app/zig-out/bin/zig-backend /usr/local/bin/zig-backend
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/zig-backend"]

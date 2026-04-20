const std = @import("std");

const listen_port: u16 = 8080;
const datadog_site_env = "DD_SITE";
const datadog_api_key_env = "DD_API_KEY";
const default_site = "datadoghq.com";
const metric_name = "zig.backend.requests";

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const api_key = std.process.getEnvVarOwned(allocator, datadog_api_key_env) catch |err| switch (err) {
        error.EnvironmentVariableNotFound => null,
        else => return err,
    };
    defer if (api_key) |k| allocator.free(k);

    const site = std.process.getEnvVarOwned(allocator, datadog_site_env) catch |err| switch (err) {
        error.EnvironmentVariableNotFound => try allocator.dupe(u8, default_site),
        else => return err,
    };
    defer allocator.free(site);

    if (api_key == null) {
        std.log.warn(
            "{s} is not set. Server will run, but metrics will NOT be forwarded to Datadog. " ++
                "Set it in the shell before starting, e.g. `export {s}=your_key_here`.",
            .{ datadog_api_key_env, datadog_api_key_env },
        );
    } else {
        std.log.info("Datadog metrics enabled (site={s}).", .{site});
    }

    const addr = try std.net.Address.parseIp("0.0.0.0", listen_port);
    var server = try addr.listen(.{ .reuse_address = true });
    defer server.deinit();
    std.log.info("Listening on http://0.0.0.0:{d}", .{listen_port});

    while (true) {
        var conn = server.accept() catch |err| {
            std.log.err("accept failed: {s}", .{@errorName(err)});
            continue;
        };
        defer conn.stream.close();

        handleConnection(allocator, conn, api_key, site) catch |err| {
            std.log.err("connection failed: {s}", .{@errorName(err)});
        };
    }
}

fn handleConnection(
    allocator: std.mem.Allocator,
    conn: std.net.Server.Connection,
    api_key: ?[]const u8,
    site: []const u8,
) !void {
    var read_buffer: [8192]u8 = undefined;
    var http_server = std.http.Server.init(conn, &read_buffer);

    var request = http_server.receiveHead() catch |err| {
        std.log.warn("receiveHead failed: {s}", .{@errorName(err)});
        return;
    };

    const target = request.head.target;

    if (std.mem.eql(u8, target, "/health")) {
        try request.respond("ok\n", .{
            .extra_headers = &.{
                .{ .name = "content-type", .value = "text/plain" },
            },
        });
    } else {
        try request.respond("hello from zig\n", .{
            .extra_headers = &.{
                .{ .name = "content-type", .value = "text/plain" },
            },
        });
    }

    if (api_key) |key| {
        sendMetric(allocator, key, site, target) catch |err| {
            std.log.err("datadog submit failed: {s}", .{@errorName(err)});
        };
    }
}

fn sendMetric(
    allocator: std.mem.Allocator,
    api_key: []const u8,
    site: []const u8,
    path: []const u8,
) !void {
    var client = std.http.Client{ .allocator = allocator };
    defer client.deinit();

    const url = try std.fmt.allocPrint(allocator, "https://api.{s}/api/v2/series", .{site});
    defer allocator.free(url);

    const now = std.time.timestamp();
    const body = try std.fmt.allocPrint(
        allocator,
        "{{\"series\":[{{\"metric\":\"{s}\",\"type\":1,\"points\":[{{\"timestamp\":{d},\"value\":1}}],\"tags\":[\"path:{s}\"]}}]}}",
        .{ metric_name, now, path },
    );
    defer allocator.free(body);

    var response_storage = std.ArrayList(u8).init(allocator);
    defer response_storage.deinit();

    const result = try client.fetch(.{
        .method = .POST,
        .location = .{ .url = url },
        .extra_headers = &.{
            .{ .name = "Content-Type", .value = "application/json" },
            .{ .name = "DD-API-KEY", .value = api_key },
        },
        .payload = body,
        .response_storage = .{ .dynamic = &response_storage },
    });

    if (@intFromEnum(result.status) >= 300) {
        std.log.err(
            "datadog responded {d}: {s}",
            .{ @intFromEnum(result.status), response_storage.items },
        );
    }
}

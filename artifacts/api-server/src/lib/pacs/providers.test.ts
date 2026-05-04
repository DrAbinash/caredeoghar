import { describe, it, expect } from "vitest";
import { isBlockedHost, resolveAndCheckHost } from "./providers";

// ── isBlockedHost ─────────────────────────────────────────────────────────────
// Regression tests for the SSRF blocklist. Primary focus: IPv4-mapped IPv6
// addresses that bypass a naive IPv4-only private-range check.
// CVE scenario: attacker submits {"host":"::ffff:127.0.0.1","port":5432} to
// POST /api/dicom/test-connection to scan internal services.

describe("isBlockedHost", () => {
  // ── Plain IPv4 must still be blocked ──────────────────────────────────────
  it("blocks loopback 127.0.0.1", () => {
    expect(isBlockedHost("127.0.0.1")).not.toBeNull();
  });

  it("blocks private 10.0.0.1", () => {
    expect(isBlockedHost("10.0.0.1")).not.toBeNull();
  });

  it("blocks private 172.16.0.1", () => {
    expect(isBlockedHost("172.16.0.1")).not.toBeNull();
  });

  it("blocks private 192.168.1.1", () => {
    expect(isBlockedHost("192.168.1.1")).not.toBeNull();
  });

  it("blocks link-local 169.254.169.254 (AWS/GCP metadata)", () => {
    expect(isBlockedHost("169.254.169.254")).not.toBeNull();
  });

  it("blocks link-local 169.254.1.1 (full /16 range)", () => {
    expect(isBlockedHost("169.254.1.1")).not.toBeNull();
  });

  it("blocks Alibaba metadata 100.100.100.200", () => {
    expect(isBlockedHost("100.100.100.200")).not.toBeNull();
  });

  it("blocks 0.0.0.0", () => {
    expect(isBlockedHost("0.0.0.0")).not.toBeNull();
  });

  it("blocks 'localhost' literal", () => {
    expect(isBlockedHost("localhost")).not.toBeNull();
  });

  // ── IPv4-mapped IPv6 — the vulnerability class this fix closes ───────────
  // Node.js resolves these as IPv6 addresses and net.Socket can connect them
  // to the corresponding IPv4 target, so they must be explicitly checked.

  it("blocks ::ffff:127.0.0.1 (IPv4-mapped loopback, compact)", () => {
    expect(isBlockedHost("::ffff:127.0.0.1")).not.toBeNull();
  });

  it("blocks ::ffff:10.0.0.1 (IPv4-mapped private, compact)", () => {
    expect(isBlockedHost("::ffff:10.0.0.1")).not.toBeNull();
  });

  it("blocks ::ffff:169.254.169.254 (IPv4-mapped metadata, compact)", () => {
    expect(isBlockedHost("::ffff:169.254.169.254")).not.toBeNull();
  });

  it("blocks ::ffff:192.168.1.1 (IPv4-mapped private class C, compact)", () => {
    expect(isBlockedHost("::ffff:192.168.1.1")).not.toBeNull();
  });

  it("blocks ::ffff:172.16.0.1 (IPv4-mapped private class B, compact)", () => {
    expect(isBlockedHost("::ffff:172.16.0.1")).not.toBeNull();
  });

  it("blocks [::ffff:127.0.0.1] (bracketed form used in URLs)", () => {
    expect(isBlockedHost("[::ffff:127.0.0.1]")).not.toBeNull();
  });

  it("blocks 0:0:0:0:0:ffff:7f00:1 (fully expanded loopback map)", () => {
    expect(isBlockedHost("0:0:0:0:0:ffff:7f00:1")).not.toBeNull();
  });

  it("blocks 0:0:0:0:0:ffff:a9fe:a9fe (fully expanded 169.254.169.254)", () => {
    expect(isBlockedHost("0:0:0:0:0:ffff:a9fe:a9fe")).not.toBeNull();
  });

  it("blocks 0:0:0:0:0:ffff:c0a8:101 (fully expanded 192.168.1.1)", () => {
    expect(isBlockedHost("0:0:0:0:0:ffff:c0a8:101")).not.toBeNull();
  });

  it("blocks ::FFFF:127.0.0.1 (uppercase hex variant)", () => {
    expect(isBlockedHost("::FFFF:127.0.0.1")).not.toBeNull();
  });

  // ── Native IPv6 private ranges ────────────────────────────────────────────
  it("blocks ::1 (IPv6 loopback)", () => {
    expect(isBlockedHost("::1")).not.toBeNull();
  });

  it("blocks fe80::1 (IPv6 link-local)", () => {
    expect(isBlockedHost("fe80::1")).not.toBeNull();
  });

  it("blocks fc00::1 (IPv6 ULA)", () => {
    expect(isBlockedHost("fc00::1")).not.toBeNull();
  });

  it("blocks fd00::1 (IPv6 ULA fd range)", () => {
    expect(isBlockedHost("fd00::1")).not.toBeNull();
  });

  it("blocks AWS IPv6 metadata fd00:ec2::254", () => {
    expect(isBlockedHost("fd00:ec2::254")).not.toBeNull();
  });

  // ── Public addresses must be allowed ─────────────────────────────────────
  it("allows public IPv4 address", () => {
    expect(isBlockedHost("8.8.8.8")).toBeNull();
  });

  it("allows another public IPv4 address", () => {
    expect(isBlockedHost("203.0.113.1")).toBeNull();
  });

  it("allows public IPv6 2001:db8::1", () => {
    expect(isBlockedHost("2001:db8::1")).toBeNull();
  });

  it("allows public IPv6 2606:4700:4700::1111 (Cloudflare)", () => {
    expect(isBlockedHost("2606:4700:4700::1111")).toBeNull();
  });

  it("returns null (allowed) for external DICOM host pacs.hospital.org", () => {
    // Hostnames that are not in the literal block list are allowed at the
    // isBlockedHost level — DNS resolution is checked by resolveAndCheckHost.
    expect(isBlockedHost("pacs.hospital.org")).toBeNull();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it("blocks empty string", () => {
    expect(isBlockedHost("")).not.toBeNull();
  });

  it("blocks whitespace-only string", () => {
    expect(isBlockedHost("   ")).not.toBeNull();
  });
});

// ── resolveAndCheckHost ───────────────────────────────────────────────────────
// These tests hit real DNS; they verify that the function rejects known-blocked
// inputs before even attempting resolution, and that it rejects invalid hosts.

describe("resolveAndCheckHost", () => {
  it("rejects ::ffff:127.0.0.1 before DNS lookup", async () => {
    const result = await resolveAndCheckHost("::ffff:127.0.0.1");
    expect(result.ok).toBe(false);
  });

  it("rejects 127.0.0.1 before DNS lookup", async () => {
    const result = await resolveAndCheckHost("127.0.0.1");
    expect(result.ok).toBe(false);
  });

  it("rejects localhost before DNS lookup", async () => {
    const result = await resolveAndCheckHost("localhost");
    expect(result.ok).toBe(false);
  });

  it("rejects 169.254.169.254 before DNS lookup", async () => {
    const result = await resolveAndCheckHost("169.254.169.254");
    expect(result.ok).toBe(false);
  });

  it("rejects ::ffff:169.254.169.254 before DNS lookup", async () => {
    const result = await resolveAndCheckHost("::ffff:169.254.169.254");
    expect(result.ok).toBe(false);
  });

  it("rejects completely invalid hostname", async () => {
    const result = await resolveAndCheckHost("this-host-does-not-exist.invalid");
    expect(result.ok).toBe(false);
  });
});

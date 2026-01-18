import { describe, expect, it } from "vitest";
import { buildServer } from "./server";

describe("API server", () => {
  it("initializes routes without throwing", () => {
    const server = buildServer();
    expect(server).toBeDefined();
    server.close();
  });
});


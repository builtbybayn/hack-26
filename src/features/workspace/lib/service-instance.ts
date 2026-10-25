"use client";
import type { ResearchService } from "./service";
import { VaultResearchService } from "./vault-service";

/** One browser adapter, shared by the workspace and extension quick actions. */
const rawService: ResearchService = new VaultResearchService();
const methods = new Map<PropertyKey, unknown>();
export const workspaceService = new Proxy(rawService, {
  get(target, key) {
    const value = Reflect.get(target, key);
    if (typeof value !== "function") return value;
    if (!methods.has(key)) methods.set(key, value.bind(target));
    return methods.get(key);
  },
});

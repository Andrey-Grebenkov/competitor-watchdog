import { describe, expect, it } from "vitest";
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  MAX_FEEDBACK_LENGTH,
  isFeedbackType,
} from "@/lib/feedback";

describe("isFeedbackType", () => {
  it("accepts every known type", () => {
    for (const type of FEEDBACK_TYPES) {
      expect(isFeedbackType(type)).toBe(true);
    }
  });

  it("rejects unknown and malformed values", () => {
    expect(isFeedbackType("")).toBe(false);
    expect(isFeedbackType("BUG")).toBe(false);
    expect(isFeedbackType("toString")).toBe(false);
  });
});

describe("feedback constants", () => {
  it("labels every type", () => {
    expect(Object.keys(FEEDBACK_TYPE_LABELS).sort()).toEqual(
      [...FEEDBACK_TYPES].sort(),
    );
  });

  it("caps the message length", () => {
    expect(MAX_FEEDBACK_LENGTH).toBe(2000);
  });
});
